# PLAN_HARDENING.md — Sync de Email à Prova de Volume (2026-05-03)

> **Contexto:** o `sync-email` actual processa tudo numa única invocação Edge Function via `EdgeRuntime.waitUntil(finishRun)`. Resultado observado: HTTP 546 (worker terminated) em runs cron desde 2026-04-24, **12 sync_runs órfãos em `running`** (limpos a 2026-05-03), invoices criadas mas Drive/Sheets a meio. O `reprocess-pending` (cron 15min) recupera silenciosamente, mas o sistema não é observável e não escala.
>
> **Objectivo:** transformar o pipeline de sync em **fila persistente + workers stateless idempotentes**, capaz de aguentar 100-1000 emails/dia por tenant em regime contínuo, e suportar um botão one-shot de "Importar últimos 3 meses" sem rebentar.
>
> **Princípios:**
> - **A BD é a fila.** Workers competem por items via `SELECT ... FOR UPDATE SKIP LOCKED`.
> - **Cada worker corre em <30s.** Auto-dispara o próximo via `pg_net.http_post` (não `EdgeRuntime.waitUntil`).
> - **Cron de 1min é watchdog.** Se um self-trigger se perde, o cron pega o trabalho preso.
> - **Idempotência absoluta.** Qualquer worker pode morrer a qualquer momento; outro recolhe sem dano.
> - **Observável de fora.** `sync_jobs` reflete o pedido lógico do user (não a invocação técnica). UI vê progresso live.
>
> **Não-objectivos desta iteração:**
> - Multi-conta Gmail por tenant em paralelo (fica para depois).
> - Realtime Supabase para progresso (polling de 5s chega).
> - Negociar limites com OpenRouter (decisão comercial, fora do scope técnico).
>
> **Volume-alvo:**
> - **Caso médio**: 100 emails/dia por tenant, ~10 facturas reais (resto = extratos, marketing, viagens).
> - **Pico contínuo**: 1000 emails/dia.
> - **One-shot backfill 3 meses**: ~9000 emails, ~900 facturas reais por tenant.
>
> **Custos esperados**: ~$21/mês/tenant em regime contínuo (caso médio). ~$63 por tenant num backfill 3 meses. Detalhe em §9.

---

## FASES (tracker)

| # | Fase | Esforço | Status | Critério-chave de aceitação |
|---|---|---|---|---|
| 0 | Quick fix do sangramento (remover `EdgeRuntime.waitUntil`, fechar `sync_runs` síncrono) | ~1h | ✅ 2026-05-03 | Próximo cron 23:58 fecha como `done`, zero HTTP 546 |
| 1 | Migration `sync_jobs` + state machine + colunas novas em `invoices` | 1 dia | ✅ 2026-05-03 | Migration aplicada, frontend não parte (rename adiado para Fase 2) |
| 2 | Worker `discover-emails` + cron trigger + watchdog 1min | 1 dia | ✅ 2026-05-03 | Cron 23:58 cria `sync_jobs`, invoices entram como `discovered` |
| 3 | Worker `fetch-attachments` (download Gmail → Storage) | 1 dia | ✅ 2026-05-03 | Invoices `discovered` → `analyzing` em <1h, nada preso em `fetching` >5min |
| 4 | Worker `analyze-batch` (Gemini com rate limit por concorrência) | 0.5 dia | ☐ | 100 emails/dia processados em <2h, Gemini ≤50/min |
| 5 | Worker `finalize-batch` (Drive + Sheets) | 0.5 dia | ☐ | Invoices `extracted` → `completed` em <5min |
| 6 | UI admin `/admin/sync-jobs` + detail page | 1 dia | ☐ | Admin vê em tempo real estado de cada tenant |
| 7 | UI user `/sync/:job_id` + botão "Importar últimos 3 meses" | 1.5 dia | ☐ | User clica "3 meses", vê progresso, recebe notificação |
| 8 | Hardening: retry backoff, circuit breaker, alertas Slack, cleanup velho | 1-2 dias | ☐ | Kill Gemini deliberado → sistema recupera sem perder items |

**Total estimado:** ~10 dias de trabalho focado.
**Regra:** após cada fase, esperar 1 ciclo cron completo (24h) antes de avançar à seguinte. Não acumular fases não-validadas.

---

## ÍNDICE

1. [Decisões arquitectónicas (já tomadas)](#decisoes)
2. [State machine das invoices](#statemachine)
3. [Tabela `sync_jobs`](#syncjobs)
4. [Edge Functions (4 workers)](#workers)
5. [Backpressure e rate limiting](#backpressure)
6. [Watchdog cron](#watchdog)
7. [UX: progresso e botão "3 meses"](#ux)
8. [Roadmap faseado e observável](#roadmap)
9. [Custos realistas](#custos)
10. [Migration plan](#migration)
11. [Observabilidade e alertas](#observabilidade)
12. [Riscos & mitigações](#riscos)

---

<a id="decisoes"></a>
## 1. Decisões arquitectónicas (já tomadas)

| # | Decisão | Justificação |
|---|---|---|
| D1 | Self-trigger via `pg_net.http_post`, não `EdgeRuntime.waitUntil` | Vive no Postgres, sobrevive à morte do worker, não tem cap CPU/wall do edge runtime. |
| D2 | 1 `sync_job` activo por tenant (UNIQUE partial index) | UX clara, sem race conditions inter-job no mesmo tenant. Multi-conta resolvido com 1 job que itera contas. |
| D3 | Botão "3 meses" disponível para todos os planos (sem gating inicial) | Aceitar custo experimental durante MVP. Adicionar gating na Fase 8 se necessário. |
| D4 | `sync_runs` actual → arquivada como `sync_runs_legacy`, nova `sync_jobs` clean | Schema actual reflete invocação técnica, não pedido lógico. Sem valor histórico (a maioria está em `running` falso). |
| D5 | Polling de 5s no front, não Realtime | Realtime tem custo e complexidade. Polling chega para o caso de uso (uma página de progresso, não dashboard global). |
| D6 | 5 workers Gemini paralelos como rate limit "natural" | 60 req/min Gemini ÷ 5s/call = 12 paralelos teóricos. Fica em 5 com margem para latência. Sem token bucket. |
| D7 | Dedup mantém-se em 2 níveis: `(message_id, attachment_id)` + `sha256` | Já existe e funciona. Não tocar. |
| D8 | Janela Gmail mantém-se `newer_than:7d` para cron diário | Defensiva contra falhas de cron, indexação Gmail tardia, re-auth. |

---

<a id="statemachine"></a>
## 2. State machine das invoices

A coluna `invoices.status` actual já tem alguns valores (`analyzing`, `review`, `failed`). Vamos formalizar e ampliar:

```
discovered      Gmail listou, sabemos que o email+anexo existem.
                Não há ficheiro em Storage ainda. Não há análise.
    │
    ▼
fetching        Worker em curso a baixar o anexo do Gmail.
                (estado transitório, locked_until > now())
    │
    ▼
analyzing       Ficheiro em Storage. À espera de Gemini.
    │
    ▼
extracted       Gemini deu output. À espera de Drive + Sheets.
    │
    ▼
completed       Drive ok, Sheet ok. Item terminal de sucesso.

Estados terminais alternativos:
─────────────────────────────────
review              Gemini extraiu mas com dúvida (review_reason setado).
                    User decide manualmente.
rejected            Gemini disse "não é fatura" / "não é documento".
                    Soft delete (deleted_at setado).
duplicate           Hash colidiu pós-analyze (race com outra run).
                    Soft delete.
failed_permanent    3 attempts esgotados em qualquer fase.
                    UI mostra retry manual.
```

**Transições válidas** (impostas por trigger ou por convenção nos workers):

```
discovered  → fetching (worker pega lock) → analyzing | failed_permanent
analyzing   → extracted | rejected | review | failed_permanent
extracted   → completed | failed_permanent
qualquer    → duplicate (hash collision detectado late)
qualquer    → cancelled (sync_job cancelado pelo user)
```

**Colunas novas em `invoices`** (migration):

```sql
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS attempts smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS locked_until timestamptz,
  ADD COLUMN IF NOT EXISTS sync_job_id uuid REFERENCES public.sync_jobs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_worker_pickup
  ON public.invoices (status, locked_until, next_retry_at)
  WHERE status IN ('discovered','analyzing','extracted')
    AND deleted_at IS NULL;
```

**Padrão worker pickup (idempotente):**

```sql
-- Worker analyze-batch pega 5 items
WITH picked AS (
  SELECT id
  FROM public.invoices
  WHERE status = 'analyzing'
    AND deleted_at IS NULL
    AND (locked_until IS NULL OR locked_until < now())
    AND (next_retry_at IS NULL OR next_retry_at < now())
    AND attempts < 3
  ORDER BY created_at
  LIMIT 5
  FOR UPDATE SKIP LOCKED
)
UPDATE public.invoices
   SET locked_until = now() + interval '90 seconds',
       attempts = attempts + 1
  WHERE id IN (SELECT id FROM picked)
RETURNING *;
```

`SKIP LOCKED` garante que 5 workers paralelos pegam 5 batches distintos sem coordenação externa. `locked_until` libera o item se o worker morrer (próximo cron pickup).

---

<a id="syncjobs"></a>
## 3. Tabela `sync_jobs`

```sql
CREATE TABLE public.sync_jobs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email_account_id uuid REFERENCES public.email_accounts(id) ON DELETE CASCADE,

  trigger         text NOT NULL CHECK (trigger IN ('cron','manual','backfill_3m','admin')),

  -- Janela temporal (NULL = "tudo o que Gmail devolver com newer_than:7d")
  date_from       timestamptz,
  date_to         timestamptz,

  -- Estado da paginação Gmail (preservado entre invocações)
  gmail_query     text NOT NULL,
  gmail_page_token text,

  -- Contadores (atualizados pelos workers)
  total_messages_seen   int NOT NULL DEFAULT 0,
  total_invoices_created int NOT NULL DEFAULT 0,
  counts_by_status      jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Ex: {"discovered":12,"analyzing":340,"completed":1200,"rejected":450,"failed_permanent":3}

  status          text NOT NULL DEFAULT 'queued'
                  CHECK (status IN ('queued','discovering','processing','done','paused_reauth','cancelled','error')),
  error_message   text,

  started_at      timestamptz NOT NULL DEFAULT now(),
  last_heartbeat_at timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz,

  created_at      timestamptz NOT NULL DEFAULT now()
);

-- 1 job activo por tenant
CREATE UNIQUE INDEX uniq_sync_jobs_active_per_tenant
  ON public.sync_jobs (tenant_id)
  WHERE status IN ('queued','discovering','processing','paused_reauth');

CREATE INDEX idx_sync_jobs_pickup
  ON public.sync_jobs (status, last_heartbeat_at)
  WHERE status IN ('discovering','processing');

CREATE INDEX idx_sync_jobs_tenant_recent
  ON public.sync_jobs (tenant_id, created_at DESC);
```

**RLS:**
- `SELECT`: members do tenant podem ver os seus jobs (use `is_member_of_tenant(tenant_id)`).
- `INSERT/UPDATE/DELETE`: só service_role (workers). User cria via Edge Function, não direct.

**Trigger heartbeat:** cada worker faz `UPDATE sync_jobs SET last_heartbeat_at = now() WHERE id = ?` no início do batch. Watchdog detecta jobs presos via `last_heartbeat_at < now() - interval '5 minutes'`.

---

<a id="workers"></a>
## 4. Edge Functions (4 workers)

Cada worker:
- Recebe header `x-cron-secret` ou `x-internal-secret` (chamado por outros workers).
- Pega N items via `SELECT FOR UPDATE SKIP LOCKED`.
- Processa cada um.
- Faz transição de estado.
- Auto-dispara próximo via `pg_net.http_post` se ainda há trabalho.
- Devolve em <30s sempre.

### 4.1 `discover-emails` (substitui fase 1 do `sync-email` actual)

**Input:** `{ sync_job_id: uuid }`

**Lógica:**
1. Carrega `sync_job` + `email_account` + token Google (refresh se expirado).
2. Faz `gmail.users.messages.list` 1 página (max 50 msgs) com `pageToken` do job.
3. Para cada message ID:
   - `INSERT ... ON CONFLICT (tenant_id, email_message_id) DO NOTHING` em invoices com `status='discovered'`, `sync_job_id=?`.
4. Update `sync_job`: `gmail_page_token = nextPageToken`, `total_messages_seen += N`, `last_heartbeat_at = now()`.
5. Se `nextPageToken`: `pg_net.http_post` para si próprio (próxima página).
6. Senão: transita `sync_job.status` para `processing`, e dispara `fetch-attachments`.

**Tempo esperado:** 5-15s por página de 50 msgs.

### 4.2 `fetch-attachments`

**Input:** `{ sync_job_id?: uuid }` (opcional — pode trabalhar global se chamado pelo watchdog)

**Lógica:**
1. Pega 5 invoices `status='discovered'` (com `FOR UPDATE SKIP LOCKED`, marca `locked_until = now()+90s`, `status='fetching'`).
2. Para cada uma:
   - `messages.get full` para obter lista de partes/anexos.
   - Para cada attachment válido (MIME + size + ext):
     - `attachments.get` → bytes.
     - `sha256` → dedup hash query (se já existe outra invoice viva ou rejeitada com este hash, marca esta como `duplicate` + soft delete + skip).
     - Storage upload.
     - Update invoice: `status='analyzing'`, `storage_path=?`, `attachment_hash=?`, `email_subject/from/received_at=?`.
   - Se a mensagem não tinha anexos válidos: `status='rejected'`, `review_reason='sem_anexos_validos'`, soft delete.
3. Update `sync_job.counts_by_status` + `last_heartbeat_at`.
4. Se ainda há `discovered` para este job: self-dispara.
5. Senão: dispara `analyze-batch`.

**Tempo esperado:** 10-25s por batch de 5.

**Nota crítica:** uma mensagem Gmail pode ter múltiplos anexos. O actual cria 1 invoice por anexo. Mantemos isso, mas o `discovered` stub é por *mensagem*. No `fetch-attachments`, expandimos: se a mensagem tem 3 anexos, a invoice original vira para o 1º anexo, e os outros 2 são `INSERT` novos com mesmo `email_message_id` mas diferentes `email_attachment_id`.

### 4.3 `analyze-batch` (refactor do actual `reprocess-pending` ou nova função separada)

**Input:** `{ sync_job_id?: uuid }`

**Lógica:**
1. Pega 5 invoices `status='analyzing'` com `FOR UPDATE SKIP LOCKED`, `locked_until=now()+120s`.
2. Para cada item: chama `analyze-document` Edge Function (que já existe) com `{ invoice_id, skip_finalize: true }`.
3. `analyze-document` actualiza a invoice: `status='extracted'` (ou `rejected`/`review` conforme output).
4. Update `sync_job` counters + heartbeat.
5. Self-dispara se há mais.
6. Senão dispara `finalize-batch`.

**Tempo esperado:** 25-30s por batch de 5 (Gemini ~5s/call sequencial dentro do worker — mantemos sequencial para naturalmente respeitar 60/min com 5 workers paralelos).

### 4.4 `finalize-batch`

**Input:** `{ sync_job_id?: uuid }`

**Lógica:**
1. Pega 5 invoices `status='extracted'` com lock.
2. Para cada: cria pasta Drive (se não existir), upload PDF, append linha Sheet.
3. `status='completed'`, `drive_file_id=?`, `sheet_row_id=?`.
4. Update `sync_job`. Se for o último: `status='done'`, `completed_at=now()`, dispara notificação ao user.
5. Self-dispara se há mais.

**Tempo esperado:** 15-25s por batch de 5.

---

<a id="backpressure"></a>
## 5. Backpressure e rate limiting

**Estratégia escolhida (D6):** limitar concorrência de workers, não usar token bucket.

**Como:**
- Cron dispara `analyze-batch` 1× por minuto (com `pg_net`). O worker corre 1 batch de 5 sequenciais → ~25s.
- Workers pegam de `analyzing` queue. Se múltiplos cron + self-triggers convergem, `SKIP LOCKED` evita duplicação, mas pode haver até **5 workers paralelos** num pico — exactamente o alvo (5 × 12/min cada = 60/min Gemini).

**Drive / Sheets:** mesmo padrão para `finalize-batch`. 5 workers × 12 ops/min cada = 60/min Drive (vs limite 100/min — margem 40%).

**Sentinela:** se Gemini devolver 429 (rate limited), worker faz `next_retry_at = now() + interval '60s'` na invoice e larga lock. Próximo cron retoma.

---

<a id="watchdog"></a>
## 6. Watchdog cron

Cron jobs novos (substituem o `sync-email-nightly` actual numa fase posterior):

```sql
-- Cron 1: trigger de novos jobs cron diários (mantém o 23:58)
SELECT cron.schedule(
  'sync-jobs-cron-trigger',
  '58 23 * * *',
  $$
  -- Para cada email_account activa sem job activo, cria sync_job trigger='cron'
  INSERT INTO public.sync_jobs (tenant_id, user_id, email_account_id, trigger, gmail_query, status)
  SELECT ea.tenant_id, ea.user_id, ea.id, 'cron',
         'has:attachment (filename:pdf OR filename:jpg OR filename:jpeg OR filename:png) newer_than:7d',
         'queued'
    FROM public.email_accounts ea
    JOIN public.tenants t ON t.id = ea.tenant_id
   WHERE ea.is_active = true
     AND t.deleted_at IS NULL
     AND COALESCE((t.onboarding_data->>'emailSync')::text, 'true') != 'false'
     AND NOT EXISTS (
       SELECT 1 FROM public.sync_jobs sj
        WHERE sj.tenant_id = ea.tenant_id
          AND sj.status IN ('queued','discovering','processing','paused_reauth')
     );
  $$
);

-- Cron 2: watchdog que dispara workers para o trabalho pendente
-- Corre cada minuto. Idempotente — se workers já estão a correr, SKIP LOCKED não duplica.
SELECT cron.schedule(
  'sync-jobs-watchdog',
  '* * * * *',
  $$
  -- 2a. Discovery workers: 1× por job em estado 'queued' ou 'discovering' sem heartbeat recente
  SELECT net.http_post(
    url := 'https://sxfwprydmllovnxxjhrh.supabase.co/functions/v1/discover-emails',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-cron-secret', current_setting('app.cron_secret', true)
    ),
    body := jsonb_build_object('sync_job_id', sj.id)
  )
  FROM public.sync_jobs sj
  WHERE sj.status IN ('queued','discovering')
    AND sj.last_heartbeat_at < now() - interval '90 seconds';

  -- 2b. Fetch workers: dispara 1× se há discovered não-locked
  SELECT net.http_post(
    url := 'https://sxfwprydmllovnxxjhrh.supabase.co/functions/v1/fetch-attachments',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret', current_setting('app.cron_secret', true)),
    body := '{}'::jsonb
  )
  WHERE EXISTS (
    SELECT 1 FROM public.invoices
    WHERE status = 'discovered'
      AND deleted_at IS NULL
      AND (locked_until IS NULL OR locked_until < now())
    LIMIT 1
  );

  -- 2c. Analyze: dispara 5× se há analyzing
  SELECT net.http_post(
    url := 'https://sxfwprydmllovnxxjhrh.supabase.co/functions/v1/analyze-batch',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret', current_setting('app.cron_secret', true)),
    body := '{}'::jsonb
  )
  FROM generate_series(1, 5) g
  WHERE EXISTS (
    SELECT 1 FROM public.invoices
    WHERE status = 'analyzing'
      AND deleted_at IS NULL
      AND (locked_until IS NULL OR locked_until < now())
      AND (next_retry_at IS NULL OR next_retry_at < now())
    LIMIT 1
  );

  -- 2d. Finalize: dispara 5× se há extracted
  SELECT net.http_post(
    url := 'https://sxfwprydmllovnxxjhrh.supabase.co/functions/v1/finalize-batch',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret', current_setting('app.cron_secret', true)),
    body := '{}'::jsonb
  )
  FROM generate_series(1, 5) g
  WHERE EXISTS (
    SELECT 1 FROM public.invoices
    WHERE status = 'extracted'
      AND deleted_at IS NULL
      AND (locked_until IS NULL OR locked_until < now())
    LIMIT 1
  );

  -- 2e. Marcar jobs done quando todas as invoices terminaram
  UPDATE public.sync_jobs sj
     SET status = 'done', completed_at = now()
   WHERE sj.status = 'processing'
     AND NOT EXISTS (
       SELECT 1 FROM public.invoices i
        WHERE i.sync_job_id = sj.id
          AND i.status IN ('discovered','fetching','analyzing','extracted')
          AND i.deleted_at IS NULL
     );
  $$
);
```

**Decisão dependente:** o `current_setting('app.cron_secret', true)` exige `ALTER DATABASE postgres SET app.cron_secret = '...'` — alternativa é hardcode do secret no SQL como fazemos hoje. Vou validar na implementação qual é cleaner.

---

<a id="ux"></a>
## 7. UX: progresso e botão "3 meses"

### 7.1 Página de progresso `/sync/:job_id`

```
┌─────────────────────────────────────────────────┐
│ Sincronização em curso                          │
│                                                 │
│ Empresa: FASHIONVIANA, LDA                      │
│ Iniciado: há 12 minutos                         │
│                                                 │
│ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  ████             │
│ Descoberto: 1,240 emails       Análise: 87/1240 │
│                                                 │
│ ┌───────────────┬───────┐                       │
│ │ Estado        │ Conta │                       │
│ ├───────────────┼───────┤                       │
│ │ Descobertos   │ 1,153 │                       │
│ │ A baixar      │    34 │                       │
│ │ A analisar    │    18 │                       │
│ │ A guardar     │    12 │                       │
│ │ Concluídos    │    23 │                       │
│ │ Não-faturas   │   142 │                       │
│ │ Falhas        │     0 │                       │
│ └───────────────┴───────┘                       │
│                                                 │
│ ETA: ~3h 20min                                  │
│ [Cancelar]  [Notificar quando concluir]         │
└─────────────────────────────────────────────────┘
```

- Polling 5s do front a `GET /api/sync-jobs/:id` (RPC ou view).
- "Cancelar" → `UPDATE sync_jobs SET status='cancelled'`. Workers verificam isto antes de pegar próximo batch.
- "Notificar" → email + in-app notification quando `status='done'`.

### 7.2 Botão "Importar últimos 3 meses"

Localização: `Settings > Empresa > Email`, próximo do "Verificar emails agora".

```
┌──────────────────────────────────────────────────┐
│ Importação inicial                               │
│                                                  │
│ Esta empresa ainda não tem o histórico do email  │
│ importado. Podemos buscar facturas dos últimos 3 │
│ meses automaticamente.                           │
│                                                  │
│ Estimativa para a sua conta:                     │
│   ~9,000 emails analisados                       │
│   ~900 facturas esperadas                        │
│   Tempo: ~4-6 horas em background                │
│                                                  │
│  [ Importar últimos 3 meses ]                    │
└──────────────────────────────────────────────────┘
```

- Cria `sync_job` com `trigger='backfill_3m'`, `date_from = today - 90d`, `date_to = today`, `gmail_query = 'has:attachment ... after:YYYY/MM/DD before:YYYY/MM/DD'`.
- Redirect para `/sync/:job_id`.
- Botão fica desactivado se já houve um `backfill_*` done para esta empresa, ou se há sync activo.

### 7.3 Comportamento do "Verificar emails agora" (manual)

Continua a funcionar, mas agora cria um `sync_job` `trigger='manual'` em vez de chamar a edge function direct. Redireciona para `/sync/:job_id` para o user ver progresso. Hoje ele clica e fica a olhar para um spinner — agora vê números a mexer.

---

<a id="roadmap"></a>
## 8. Roadmap faseado e observável

Cada fase é **mergeable independentemente**, com critério de aceitação claro e métrica observável. Sem big-bang.

### Fase 0 — Quick fix do sangramento (1h)

**Objectivo:** parar o HTTP 546 imediatamente, sem mudar arquitectura.

**Mudanças:**
- `sync-email/index.ts`: remover `EdgeRuntime.waitUntil(finishRun)`. Fechar `sync_runs` síncronamente no fim da fase 1 com `total_discovered = invoices criadas`. Manter o fan-out a `analyze-document` mas em modo "best-effort" (sem await, sem promessa de completion).
- `reprocess-pending` (cron 15min) já trata do resto.

**Critério de aceitação:**
- Próximo cron 23:58 cria `sync_run` e fecha como `done` em <30s.
- Logs Edge mostram `status_code=200`, sem 546.
- Invoices continuam a ser criadas e analisadas (timing pode atrasar até 15min para análise).

**Observável:** query `SELECT status, count(*) FROM sync_runs WHERE started_at > now() - interval '24h' GROUP BY status;`

### Fase 1 — Migration `sync_jobs` + state machine (1 dia)

**Objectivo:** infra-estrutura nova em paralelo com a antiga, sem mudança de comportamento.

**Mudanças:**
- Migration: cria `sync_jobs` (DDL §3), adiciona colunas em `invoices` (§2).
- Cria função `pick_invoices_for_processing(p_status text, p_limit int)` em SQL, encapsulando o `FOR UPDATE SKIP LOCKED`.
- ~~`sync_runs` → renomeada para `sync_runs_legacy`~~. **Adiado para Fase 2** (ver nota abaixo).
- Não toca em edge functions ainda.

**Nota desvio Fase 1 (2026-05-03):** o rename de `sync_runs → sync_runs_legacy` foi
adiado para a Fase 2. Razão dupla:
1. O frontend (`useSyncStatus.ts`) usa Realtime subscription em `sync_runs`.
   Postgres logical replication não emite eventos para *views*, só para
   tabelas. Renomear e expor view com o mesmo nome quebraria o banner de
   progresso live.
2. O `sync-email` antigo ainda escreve em `sync_runs`. Suportar
   INSERT/UPDATE via view exigiria triggers `INSTEAD OF`, que contraria
   "Não toca em edge functions ainda".

Quando o `sync-email` antigo for desactivado na Fase 2, o rename é trivial:
basta o cron antigo deixar de escrever, depois renomear, e finalmente
trocar o Realtime publication + filtro do frontend para `sync_runs_legacy`
(ou criar view com triggers).

**Critério de aceitação:**
- ✅ Migration aplica sem erros (`mcp__supabase__apply_migration`).
- ✅ Tabelas/indexes/RLS criados.
- ✅ Frontend continua a mostrar histórico de syncs (tabela `sync_runs` intacta).

**Observável:** `SELECT * FROM sync_jobs LIMIT 1` retorna estrutura correcta. Inbox UI ainda funciona.

### Fase 2 — Worker `discover-emails` + cron trigger (1 dia)

**Objectivo:** discovery sai do `sync-email` antigo para função nova baseada em `sync_jobs`.

**Mudanças:**
- Nova edge function `discover-emails` (§4.1).
- Cron trigger novo: cria `sync_jobs` para cada conta activa às 23:58 UTC.
- Cron watchdog de 1min (§6).
- `sync-email` antigo desactivado (mas mantido o ficheiro).
- Cron `sync-email-nightly` antigo desactivado (`cron.unschedule`).

**Critério de aceitação:**
- Próximo cron 23:58 cria N `sync_jobs` (1 por conta activa).
- Watchdog dispara `discover-emails` para cada um.
- Após ~5 min, jobs estão em `status='processing'` com invoices em `status='discovered'`.
- Nenhum HTTP 546.

**Observável:** `SELECT status, count(*) FROM sync_jobs WHERE created_at > now() - interval '1h' GROUP BY status;` e `SELECT status, count(*) FROM invoices WHERE created_at > now() - interval '1h' GROUP BY status;`

### Fase 3 — Worker `fetch-attachments` (1 dia)

**Objectivo:** download de anexos passa para worker dedicado.

**Mudanças:**
- Nova edge function `fetch-attachments` (§4.2).
- Watchdog cron passa a disparar este worker.
- `discover-emails` já cria stubs sem ficheiro; `fetch-attachments` enche-os.

**Critério de aceitação:**
- Run end-to-end: cron 23:58 → discover (5min) → fetch (10-30min para 100 emails) → invoices em `status='analyzing'`.
- `analyze-document` (existente, ainda chamado pelo `reprocess-pending` actual) processa-as como antes.

**Observável:** invoices que entram como `discovered` saem como `analyzing` em <1h. Nenhum item preso em `fetching` por >5min.

### Fase 4 — Worker `analyze-batch` (0.5 dia)

**Objectivo:** análise Gemini com rate limiting natural via concorrência limitada.

**Mudanças:**
- Nova edge function `analyze-batch` (§4.3) que substitui o `reprocess-pending` para items `analyzing`.
- Watchdog cron dispara 5× por minuto (rate limit natural).
- `reprocess-pending` continua a existir mas só para casos legados (será removida na Fase 8).

**Critério de aceitação:**
- 100 emails/dia processados em <2h.
- Gemini calls/min nunca excede 50 (margem para 60/min).

**Observável:**
- `SELECT count(*) FROM invoices WHERE status='analyzing' AND created_at > now() - interval '15min';` — fila deve drenar.

### Fase 5 — Worker `finalize-batch` (0.5 dia)

**Objectivo:** Drive + Sheets em worker dedicado com rate limiting.

**Mudanças:**
- Nova edge function `finalize-batch` (§4.4).
- Após análise, status='extracted' até este worker correr.
- Watchdog dispara 5×/min.

**Critério de aceitação:**
- Invoices `extracted` viram `completed` em <5min.
- Drive folders criadas correctamente.
- Sheet rows aparecem.

**Observável:** `SELECT count(*) FROM invoices WHERE status='extracted' AND created_at > now() - interval '15min';`

### Fase 6 — UI admin de `sync_jobs` (1 dia)

**Objectivo:** observabilidade de fora.

**Mudanças:**
- Página `/admin/sync-jobs` com tabela de jobs (filtrável por tenant, status, data).
- Detail page `/admin/sync-jobs/:id` com counts_by_status, lista de invoices do job, timeline de heartbeats.
- Botão "Cancelar" e "Reset (re-tentar items failed)".

**Critério de aceitação:** admin vê em tempo real que está a correr para cada tenant.

### Fase 7 — UI user `/sync/:job_id` + botão "3 meses" (1.5 dia)

**Objectivo:** user vê progresso e pode iniciar backfill.

**Mudanças:**
- Página `/sync/:job_id` com polling 5s (§7.1).
- Botão "Importar últimos 3 meses" em Settings (§7.2).
- "Verificar emails agora" passa a redirecionar para `/sync/:job_id`.
- Notificação on-complete (in-app + opcional email via Resend já existente).

**Critério de aceitação:** user clica "3 meses", vê progresso, recebe notificação no fim.

### Fase 8 — Hardening (1-2 dias)

**Objectivo:** torná-lo prova-de-bala.

**Mudanças:**
- Retry com exponential backoff: `next_retry_at = now() + interval (attempts * 2 minutes)`.
- Circuit breaker: se Gemini devolve 429 ou 5xx 3× num minuto, pausa workers Gemini por 5min.
- Métricas em view: `admin_sync_metrics` com throughput por hora, error rate, avg time per state.
- Alerta Slack se job preso > 1h ou error rate > 20%.
- Cleanup `reprocess-pending`, `sync-email` antigo.
- Limites por plano (D3 reavaliação): bloquear `backfill_3m` em planos free se necessário.

**Critério de aceitação:** simulação de falha (kill Gemini deliberadamente) → sistema recupera sem perder items.

---

<a id="custos"></a>
## 9. Custos realistas

**Premissas:**
- Caso médio: **100 emails/dia por tenant** (após dedup Gmail + dedup hash, todos vão a Gemini).
- ~10 facturas reais/dia, restantes 90 são "não é factura" decididos pelo Gemini.

### Regime contínuo (por tenant)

| Item | Volume/mês | Custo unitário | $/mês |
|---|---|---|---|
| Gemini (100 calls/dia × 30) | 3000 | $0.007 médio | **~$21** |
| Storage Supabase (300 anexos válidos × 500KB = 150MB) | 150MB | ~$0.02/GB | **~$0.003** |
| Edge invocations (3000 × 4 etapas + watchdog) | ~150k | free tier 500k | **$0** |
| Drive / Sheets / Gmail | gratis | — | **$0** |
| **Total tenant médio** | | | **~$21/mês** |

### Backfill 3 meses (one-shot por tenant)

| Item | Volume | Custo |
|---|---|---|
| ~9000 emails analisados | 9000 calls Gemini | **~$63** |
| Storage 900 anexos válidos × 500KB = 450MB | one-time | **~$0.01** |
| **Total backfill** | | **~$63 por tenant** |

**Tempo do backfill:** 9000 análises ÷ 60/min = **150min de Gemini**, + fetch (~60min) + finalize (~60min) = **~5h end-to-end**. ETA na UI calcula com base no throughput observado.

**Nota:** se o custo Gemini se tornar problema a médio prazo, opções (fora do scope agora):
1. Negociar limite/preço com OpenRouter ($/call ↓ com volume).
2. Trocar Gemini Pro por Gemini Flash em facturas "fáceis" (router por confidence).
3. Reintroduzir o pré-filtro sender (descartado nesta iteração por complexidade).

---

<a id="migration"></a>
## 10. Migration plan

### 10.1 `sync_runs` → `sync_runs_legacy`

```sql
ALTER TABLE public.sync_runs RENAME TO sync_runs_legacy;

-- View de compat para frontend antigo (se existir)
CREATE OR REPLACE VIEW public.sync_runs AS
SELECT id, tenant_id, user_id, trigger, status, started_at, completed_at,
       total_messages, total_discovered, total_duplicates, total_rejected,
       total_skipped, total_errors, error_message
  FROM public.sync_runs_legacy;
```

Frontend que lê `sync_runs` continua a funcionar. Quando Fase 6 entrega UI nova de `sync_jobs`, removemos a view + tabela legacy.

### 10.2 Coexistência durante migração (Fases 0-4)

- Fase 0: `sync-email` antigo continua a usar `sync_runs_legacy`.
- Fases 1-3: novos workers escrevem em `sync_jobs`.
- Não há fonte dupla — cada cron escreve para um sítio só. O cron antigo é desactivado na Fase 2.

### 10.3 Rollback plan

Se Fase 2 falhar em produção:
- `cron.unschedule('sync-jobs-cron-trigger')` + `cron.unschedule('sync-jobs-watchdog')`.
- `cron.schedule('sync-email-nightly', ...)` (re-enable o velho).
- Functions novas ficam em pé mas não chamadas.

Idempotência das migrations DDL garante zero data loss.

---

<a id="observabilidade"></a>
## 11. Observabilidade e alertas

### 11.1 Tabela `sync_job_events` (audit log opcional, Fase 8)

```sql
CREATE TABLE public.sync_job_events (
  id           bigserial PRIMARY KEY,
  sync_job_id  uuid NOT NULL REFERENCES public.sync_jobs(id) ON DELETE CASCADE,
  event_type   text NOT NULL, -- 'state_change','batch_done','error','heartbeat'
  payload      jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);
```

Útil para timeline na UI admin. Custo: ~50 rows por job médio.

### 11.2 View `admin_sync_dashboard`

```sql
CREATE OR REPLACE VIEW public.admin_sync_dashboard AS
SELECT
  date_trunc('hour', sj.created_at) AS hour,
  sj.trigger,
  count(*) AS jobs,
  count(*) FILTER (WHERE sj.status='done') AS done,
  count(*) FILTER (WHERE sj.status='error') AS errors,
  count(*) FILTER (WHERE sj.status IN ('discovering','processing')) AS active,
  avg(EXTRACT(EPOCH FROM (sj.completed_at - sj.started_at))) FILTER (WHERE sj.status='done')::int AS avg_duration_s
FROM public.sync_jobs sj
WHERE sj.created_at > now() - interval '7 days'
GROUP BY 1, 2
ORDER BY 1 DESC;
```

### 11.3 Alertas

- **Job preso**: `last_heartbeat_at < now() - interval '1 hour'` AND `status IN ('discovering','processing')` → Slack via `slack-notify`.
- **Error rate alto**: dos últimos 100 items, >20% em `failed_permanent` → Slack.
- **Backlog**: `count(invoices WHERE status='analyzing') > 1000` → Slack (overload, considerar baixar throttle).

Cron `sync-jobs-monitor` corre a cada 10 min, executa estas queries, dispara Slack se necessário.

---

<a id="riscos"></a>
## 12. Riscos & mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Self-trigger via `pg_net` falha silenciosamente | Médio | Médio | Watchdog cron de 1min como safety net (§6). |
| Gemini quota excedida em pico | Baixo | Alto | 5 workers paralelos = 60/min nominal, com headroom. Circuit breaker na Fase 8. |
| `pg_cron` para de funcionar (extensão) | Muito baixo | Crítico | Health check externo (UptimeRobot a `/api/sync-health`). Fora do scope desta iteração. |
| Token Google revogado mid-job | Médio | Médio | Worker detecta 401 → marca job `paused_reauth`, notifica user. |
| Tenant apaga conta a meio de backfill | Baixo | Baixo | `ON DELETE CASCADE` em `sync_jobs.tenant_id`. Workers verificam existência antes de processar. |
| Storage cheio (free tier 1GB) | Médio em escala | Alto | Alerta a 80%. Move para plano pago ou implementa retenção (apagar anexos com >2 anos). |
| Backfill 3m num tenant com 50k emails dispara $300+ | Baixo | Médio | Estimativa pré-execução na UI baseada em `gmail.users.messages.list resultSizeEstimate`. Confirmação explícita se >5k. |
| Race entre cron 23:58 e backfill manual | Baixo | Baixo | UNIQUE partial index em `sync_jobs` impede 2 activos no mesmo tenant. |
| Watchdog dispara 5 workers mas só há 1 item | — | Nulo | `SKIP LOCKED` faz com que 4 deles devolvem rapidamente sem trabalho. ~50ms desperdiçados. OK. |

---

## Checklist de arranque

Quando começarmos a Fase 0:

- [ ] Backup de `sync_runs` antes de tocar (`CREATE TABLE sync_runs_backup AS SELECT * FROM sync_runs`)
- [ ] Confirmar `pg_net` extension activa (`SELECT * FROM pg_extension WHERE extname='pg_net'`)
- [ ] Confirmar `pg_cron` extension activa
- [ ] Confirmar secret `CRON_SECRET` está nas Edge Functions (já está)
- [ ] Branch dedicada `feature/sync-hardening`
- [ ] Cada fase = 1 PR mergeable independentemente
- [ ] Após cada fase, correr `npm run build && npm run lint`
- [ ] Após Fase 2, esperar 1 ciclo cron completo (24h) antes de Fase 3
- [ ] Após Fase 4, esperar 24h e medir custos Gemini reais

---

**Última actualização:** 2026-05-03
**Autor:** Claude Opus 4.7 + duartemmonteiro2005
**Status:** Approved, pending Fase 0 kickoff.
