# PLAN_FASE3.md — FaturaAI: Onboarding sólido, Relatórios a sério, Feature gating central

> **Contexto (2026-04-28):** Fase 2 entregou ~70% do que estava planeado. Pilares 1, 5 e 6 estão essencialmente fechados; Pilar 4 (Stripe) está funcional em Live com Price IDs populados, webhook seguro e usage enforcement; mas **Pilar 2 (Onboarding) e Pilar 3 (Relatórios) continuam intocados**. A Fase 3 fecha esses dois e remata as pontas soltas dos Pilares 1 e 4.
>
> **Objectivo Fase 3:** entregar (a) onboarding que qualquer utilizador acaba sozinho em ≤8 min, (b) relatórios verdadeiramente configuráveis (conteúdo, destinatários, periodicidade, branding), (c) feature gating central reutilizável, (d) limpar dívida técnica que está a bloquear evolução (split `drive.ts`, etc.).
>
> **Regra de ouro:** continuar o que a Fase 2 fez bem — não regredir prompts, não duplicar lógica que já existe, e nada de nova arquitectura. Seguir CLAUDE.md (anti-slop, ≤150 LOC, sem `any`).

---

## ÍNDICE

1. [Pilar 1.5 — Pontas soltas do motor](#p1)
2. [Pilar 2 — Onboarding à prova de burros (5 steps + dry-run)](#p2)
3. [Pilar 3 — Relatórios configuráveis end-to-end](#p3)
4. [Pilar 4.5 — Feature gating central + QA Stripe Live](#p4)
5. [Pilar 7 — Dívida técnica residual](#p7)
6. [Ordem de execução recomendada](#ordem)
7. [Métricas de sucesso](#metricas)
8. [Riscos transversais](#riscos)

---

<a id="p1"></a>
## PILAR 1.5 — Pontas soltas do motor (curto)

### Estado herdado da Fase 2

✅ Já feito: rate limiter (`src/lib/rateLimiter.ts`), prompt tenant-aware multilíngue, dedup em 3 estratégias (doc_number, supplier+date+amount+summary fuzzy, hash SHA-256), sync bidireccional Sheets v1 (`updateInvoiceEverywhere`), token refresh preventivo (`ensureFreshToken`).

❌ Por fazer:

### 1.5.1 — Split do `src/lib/google/drive.ts` (344 LOC) [S]

- Ainda monolítico apesar do PLAN_FASE2 ter marcado como pré-requisito. Nunca foi tocado.
- Dividir em:
  - `drive/client.ts` — auth + request wrapper.
  - `drive/folders.ts` — `ensureFolder`, `ensureMonthFolder`, hierarquia ano/mês.
  - `drive/upload.ts` — `uploadInvoiceFile`, `replaceFile`.
  - `drive/search.ts` — `findFile*`, `listFolderContents`.
- Manter API pública compatível (re-export em `drive/index.ts`).
- Pré-requisito para a tarefa 1.5.2 e para qualquer feature que toque em organização de pastas.

### 1.5.2 — Sync bidireccional Sheets v2 (mudanças que mudam de aba/ano) [M]

- Hoje (`src/lib/sync/updateInvoice.ts`) só faz update in-place na aba derivada da `doc_date` original.
- Casos não cobertos (aceitos como warning na v1, fica para resolver agora):
  - Mudar `doc_date` para outro mês/ano → linha precisa de mover de aba.
  - Mudar `category` (anteriormente `cost_type`/`metier`) → ficheiro no Drive precisa de mover de pasta + linha pode mudar de spreadsheet se houver split por categoria.
- Referência: `ai-fatura-pro/src/lib/sync/updateInvoice.ts:161-295` e `sheets-updater.ts:249-451`.
- Estratégia: `delete + reinsert` na aba certa, atomic sob `try/catch` com rollback Supabase se Sheets falha após o delete.
- **Feature gate:** Pro+ (Starter não tem `has_auto_sheets`).

### 1.5.3 — Split do `invoiceProcessor.ts` (355 LOC) [S]

- Já passou os 150 LOC há muito. Ao tocar, dividir em:
  - `invoiceProcessor/index.ts` (orquestração).
  - `invoiceProcessor/dedup.ts` (`checkDuplicate`).
  - `invoiceProcessor/upload.ts` (storage + hash).
  - `invoiceProcessor/persist.ts` (Supabase + Sheets).
- Sem mudança de comportamento. Apenas rearrumação.

### Esforço total: ~2 dias.

---

<a id="p2"></a>
## PILAR 2 — Onboarding à prova de burros

### Estado actual (verificado 2026-04-28)

- 7 steps: Empresa, Invoice Intel, Storage, Dashboard, Automation, Review, Payment.
- `useOnboardingStorage.ts` persiste em localStorage.
- `validateStep` / `validateAllUpTo` em `lib/onboarding/validation.ts` existe mas é fraca.
- `finalizeOnboarding` em `lib/onboarding/finalize.ts` constrói `ai_prompt_config` + `invoice_name_variations[]`.
- Gating em `RequireTenant.tsx` bloqueia rotas até `onboarding_completed=true OR setup_status='ready'`.
- **Sem dry-run do prompt em momento algum.**
- **Sem preview live** (logo + cor primária só vê depois de finalizar).

### Buracos confirmados

1. **Demasiados steps.** Storage + Dashboard + Automation podem fundir em "Integrações Google" (1 step com sub-cards Drive/Sheets/Gmail).
2. **Validação leniente.** `invoiceNameVariations` pode ficar vazio → prompt do tenant inútil.
3. **Step Review é cosmético.** Lista o que inseriste, não dá warnings.
4. **Nunca testamos o prompt** antes de submeter — tenant descobre erros só na 1ª fatura real.
5. **Logo em base64 no localStorage** — pesado e não é o que vai para `tenants.logo_url`.
6. **Browser back button** corrompe estado (localStorage avança, servidor não).

### Target

- **5 steps no máximo.** Proposta:
  1. **Empresa** (nome, NIF, sector, país) — base de tudo.
  2. **Marca** (logo + cor primária) — com `BrandPreview` live a mostrar sidebar mock.
  3. **Inteligência de Faturação** (categorias, fornecedores conhecidos + variações, taxas IVA usadas) — com hint visual.
  4. **Integrações Google** (Drive opcional, Sheets opcional, Gmail opcional) — fundir Storage+Dashboard+Automation.
  5. **Teste & Pagamento** (dry-run do prompt + escolha de plano + checkout Stripe).

- **Dry-run obrigatório no step 5:**
  - User faz drop de 1 PDF (ou usa fatura-exemplo Flowzi pré-carregada).
  - Backend chama `analyze-document` com `?dry_run=true&persist=false` → não grava em BD nem em Drive, devolve só JSON extraído.
  - UI mostra: "Encontrei: HCR Fornecedores, Lda · 245,80 EUR · Categoria: Mercadorias". Botões "Está bem assim" / "Voltar atrás e ajustar".
  - Se voltar atrás, campos pré-preenchidos com o que detectou para o user editar.

- **Validação agressiva:**
  - `invoiceNameVariations`: mínimo 1 entrada não vazia.
  - NIF PT: 9 dígitos exactos (já existe `sanitizeNifForCountry`).
  - Pelo menos 1 categoria + pelo menos 3 fornecedores conhecidos para o prompt valer a pena.
  - Cor primária: contraste mínimo AAA com branco (texto de aviso, não bloqueia).

- **Preview live em todos os steps relevantes:**
  - `BrandPreview` já existe — usar mesmo no step Marca.
  - Step Inteligência: mostrar uma "preview" do prompt em accordion (read-only, debug mode).

- **Gating absoluto:** rotas excepto `/onboarding/*`, `/settings/billing`, `/logout`, `/invite/:token` redireccionam para o step actual. Confirmar que `RequireTenant` cobre.

### Tarefas

1. **[M] Refactor da estrutura de steps**
   - Reduzir `OnboardingWizard.tsx` para `TOTAL_STEPS = 5`.
   - Fundir `StepStorage` + `StepDashboard` + `StepAutomation` num só `StepIntegrations.tsx`.
   - `StepReview` desaparece — review passa a ser inline no `StepPayment` (sumário no topo do checkout).
   - Migrar dados em `useOnboardingStorage` se necessário (key bump v2).
   - Ficheiros: `OnboardingWizard.tsx`, `StepIntegrations.tsx` (novo), apagar/fundir os 3 antigos, `onboardingTypes.ts`, `useOnboardingStorage.ts`, `lib/onboarding/validation.ts`.

2. **[S] Validação agressiva**
   - `validateStep` por step com regras concretas listadas no Target.
   - Mostrar inline error + botão Avançar disabled quando inválido.
   - Ficheiro: `lib/onboarding/validation.ts`.

3. **[M] Dry-run do prompt**
   - Adicionar param `dry_run=true` ao `analyze-document` (ramo já parcialmente preparado pelo `persist`?). Validar.
   - Edge function devolve `{ extracted, warnings }` sem tocar em BD/Drive.
   - Componente `OnboardingDryRun.tsx` com `<Dropzone>` + estado loading + render do JSON com badges.
   - Custo aceitável: 1 chamada Gemini por tenant trial.
   - Ficheiros: `supabase/functions/analyze-document/index.ts`, `src/components/onboarding/OnboardingDryRun.tsx`, integração em `StepPayment.tsx` antes do checkout.

4. **[S] Preview live de marca**
   - `BrandPreview.tsx` já existe — confirmar que reage em real-time a `data.logoFile` + `data.primaryColor`.
   - Mostrar sidebar mock + dashboard mock thumbnail.

5. **[S] Servidor como fonte da verdade**
   - Quando `OnboardingWizard` monta, primeiro tenta ler `tenants.onboarding_state jsonb` (nova coluna) ou `onboarding_submissions`.
   - LocalStorage vira cache; em conflito, servidor ganha.
   - Migration: `ALTER TABLE tenants ADD COLUMN onboarding_state jsonb;` (ou usar tabela separada já existente).
   - Persist on step change (debounced 500ms).
   - Ficheiros: nova migration, `useOnboardingStorage.ts`, `OnboardingWizard.tsx`.

6. **[S] Telemetria**
   - Já existe `track(EVENTS.ONBOARDING_STEP_VIEWED)`. Garantir eventos:
     - `ONBOARDING_DRY_RUN_RAN` (success/failure + tempo).
     - `ONBOARDING_VALIDATION_BLOCKED` (step + razão).
     - `ONBOARDING_RESUMED` (de step X).
   - Ficheiros: `lib/analytics/events.ts`, sites de chamada.

### Ficheiros afectados

`src/components/onboarding/*` (refactor + novo `OnboardingDryRun`, novo `StepIntegrations`), `supabase/functions/analyze-document/index.ts` (param `dry_run`), `lib/onboarding/validation.ts`, nova migration `tenants.onboarding_state` se for por aí, `lib/analytics/events.ts`.

### Riscos

- **Reduzir steps pode partir tenants existentes em onboarding incompleto** — migrar `setup_status='in_progress'` para mapear steps antigos → novos. Script único.
- **Dry-run consome quota Gemini sem revenue ainda** — aceitável; cap a 1 dry-run por tenant via flag em `tenants.dry_run_used boolean`.
- **`finalizeOnboarding` espera o shape antigo** — actualizar o builder de `ai_prompt_config` para o novo step Inteligência.

### Esforço total: ~5–6 dias.

---

<a id="p3"></a>
## PILAR 3 — Relatórios configuráveis end-to-end

### Estado actual (verificado 2026-04-28)

- Tabela `report_deliveries` (tenant_id, period_kind, period_start, period_end, status, sent_at, error, email_to, invoices_count) — existe.
- Edge Function `send-auto-reports` com cron horário — existe.
- UI: `src/components/settings/ReportsCard.tsx` — **dropdown nunca/semanal/mensal + 1 email**, é tudo.
- Sem `report_configs`. Sem múltiplos destinatários. Sem escolha de conteúdo. Sem preview/teste. Sem branding. Sem histórico em UI. Sem alertas de falha.
- `tenants.auto_reports` + `tenants.report_email` ainda usados.

### Target

UI de configuração de relatórios completa:

- Múltiplas configs por tenant (ex.: "Semanal contabilista", "Mensal CEO").
- Frequência: diário / semanal (escolher dia 0–6) / mensal (escolher dia 1–28) / trimestral.
- Hora de envio (slider, timezone do tenant).
- Destinatários: array de emails (chips).
- Conteúdo: checkboxes — total faturas, total por fornecedor, breakdown por categoria, gráficos (line/donut), top 10 despesas, alertas de anomalias (variação >20% YoY).
- Scope: todas as empresas vs. filtrar por `company_id` / `category`.
- Botão "Enviar de teste agora" (envia ao email do owner).
- Template HTML brandado: `tenants.logo_url` + `tenants.primary_color`.
- Histórico de envios (tabela paginada) com botão "Re-enviar".
- Alertas: 3 falhas consecutivas → Slack + email ao owner.
- **Feature gate:** Starter tem 1 config simples; Pro tem N configs + custom content; Enterprise tem alertas Slack.

### Tarefas

1. **[M] Schema `report_configs`**
   ```sql
   CREATE TABLE report_configs (
     id uuid PK,
     tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
     name text NOT NULL,
     frequency text CHECK (frequency IN ('daily','weekly','monthly','quarterly')),
     send_day smallint, -- 0-6 weekly, 1-28 monthly, 1-3 quarterly
     send_hour smallint CHECK (send_hour BETWEEN 0 AND 23),
     timezone text NOT NULL DEFAULT 'Europe/Lisbon',
     recipients text[] NOT NULL DEFAULT '{}',
     content_options jsonb NOT NULL DEFAULT '{}'::jsonb,
     filters jsonb NOT NULL DEFAULT '{}'::jsonb,
     active boolean NOT NULL DEFAULT true,
     created_by uuid REFERENCES auth.users(id),
     created_at timestamptz DEFAULT now(),
     updated_at timestamptz DEFAULT now()
   );
   ```
   - RLS: SELECT por `get_user_tenant_ids()`, writes por `can_write_tenant(tenant_id)` (owner+member).
   - FK em `report_deliveries.config_id uuid` (nullable até backfill).
   - Índices: `(tenant_id, active)` e `(config_id, created_at DESC)`.
   - Migration: `XXX_report_configs.sql`.

2. **[S] Backfill + deprecação**
   - Script no fim da migration: para cada tenant com `auto_reports != 'never'`, criar 1 `report_configs` equivalente.
   - Marcar `auto_reports`/`report_email` como deprecated em comentários SQL (não dropar ainda; espera 1 release).
   - `ReportsCard.tsx` antigo continua a funcionar como wrapper sobre a 1ª config até cair.

3. **[M] Adaptar `send-auto-reports`**
   - Passa a iterar `report_configs WHERE active=true` agrupado por `(timezone, send_hour)`.
   - Para cada config, gerar conteúdo respeitando `content_options` + `filters`.
   - Inserir `report_deliveries` com `config_id`.
   - Ficheiro: `supabase/functions/send-auto-reports/index.ts`.

4. **[M] Email template brandado**
   - Decisão: HTML inline (sem React Email para não engordar deps) com `<style>` inline e CSS-in-JS leve.
   - Builder em `supabase/functions/_shared/reportEmail.ts`:
     - Header com `logo_url` (com fallback texto), banda colorida com `primary_color`.
     - Secções condicionais por `content_options`.
     - Footer "Enviado por FaturaAI · Cancelar / Configurar".
   - Suporte a chartjs server-side via `quickchart.io` (URL embedded image, sem deps).
   - Ficheiro: `supabase/functions/_shared/reportEmail.ts`.

5. **[M] UI gestão de relatórios**
   - Nova página `src/pages/settings/Reports.tsx` ou aba em Settings.
   - Componentes:
     - `ReportConfigList` — tabela de configs com toggle active.
     - `ReportConfigForm` — drawer de edição (nome, frequência, hora, recipients chips, content checkboxes, filtros).
     - `ReportContentPicker` — checkboxes agrupados.
     - `ReportTestSendButton` — chama `send-report-now` com flag de teste.
   - Substituir `ReportsCard.tsx` (não apagar ainda — wrapper).
   - Ficheiros: `src/pages/settings/Reports.tsx`, `src/components/reports/*`.

6. **[S] Endpoint `send-report-now`**
   - Edge Function nova. Aceita `{ config_id, recipients_override?, dry_run? }`.
   - Owner/member do tenant podem chamar; ratelimit 5/min/tenant.
   - Reutiliza builder do cron.
   - Ficheiro: `supabase/functions/send-report-now/index.ts`.

7. **[S] Histórico + Re-send**
   - `ReportDeliveriesTable.tsx` — paginação, filtros por config, status, período.
   - Botão Re-enviar chama `send-report-now?delivery_id=...`.

8. **[S] Alertas de falha**
   - Após cada `send-auto-reports` que falhe, query `COUNT(*) FROM report_deliveries WHERE config_id=? AND status='failed' ORDER BY created_at DESC LIMIT 3`.
   - Se 3 → `slack-notify` + email owner com template "3 falhas consecutivas em {config.name}".
   - Feature gate: Slack só Enterprise.

9. **[S] Índices novos**
   - `CREATE INDEX ON report_deliveries (tenant_id, period_kind, period_start DESC)`.
   - `CREATE INDEX ON report_deliveries (config_id, created_at DESC)` quando FK existir.

### Ficheiros afectados

`supabase/migrations/XXX_report_configs.sql`, `supabase/functions/send-auto-reports/index.ts`, `supabase/functions/send-report-now/index.ts` (novo), `supabase/functions/_shared/reportEmail.ts`, `src/pages/settings/Reports.tsx` (novo), `src/components/reports/*` (novo), `src/types/database.ts`, `src/components/settings/ReportsCard.tsx` (wrapper).

### Riscos

- **Migração de `auto_reports`/`report_email`** — backfill obrigatório antes do `send-auto-reports` antigo deixar de ler essas colunas. Validar com 1 tenant beta.
- **Cron horário com >200 configs** — paralelizar `Promise.all` em batches de 50.
- **Charts via quickchart.io** — privacidade (URLs com data); aceitável para PME, mas avaliar self-host depois.

### Esforço total: ~5–6 dias.

---

<a id="p4"></a>
## PILAR 4.5 — Feature gating central + QA Stripe Live

### Estado herdado da Fase 2

✅ Já feito: `stripe-checkout`, `stripe-webhook` com `constructEventAsync` + idempotência via `stripe_webhook_events`, `stripe-portal` deployada, Price IDs em Live populados (Starter 29,90 EUR, Pro 59,90 EUR), `analyze-document` com usage enforcement + 402 quando `invoice_limit_reached`.

❌ Por fazer:

### 4.5.1 — Hook + componente `useFeatureGate` [S]

- Hoje `tenant?.plan?.has_*` está espalhado por componentes.
- Criar:
  ```ts
  // src/hooks/useFeatureGate.ts
  export function useFeatureGate(feature: FeatureKey): { allowed: boolean; reason: 'plan_locked' | 'limit_reached' | null; upgradeTo?: PlanSlug }
  ```
- Componente:
  ```tsx
  <FeatureGate feature="reports_custom" fallback={<UpgradePrompt />}>
    <ReportsConfigForm />
  </FeatureGate>
  ```
- Mapping `FeatureKey → minPlan` central em `src/lib/billing/featureMap.ts`.
- Aplicar em: SAF-T export (Pro), multi-config reports (Pro), Slack alerts (Enterprise), Gmail sync (Pro), multi-user invite (já check no edge — adicionar UI gate).
- Ficheiros: `src/hooks/useFeatureGate.ts`, `src/components/common/FeatureGate.tsx`, `src/lib/billing/featureMap.ts`, sites de chamada.

### 4.5.2 — Reset mensal de `invoices_this_month` [S]

- Hoje há check de limite mas sem cron de reset confirmado.
- Confirmar/criar cron `0 0 1 * *` que faz `UPDATE tenants SET invoices_this_month = 0`.
- Verificar `database/CRON.sql`. Se já existir, tarefa morre.
- Ficheiro: nova entrada em `database/CRON.sql` se faltar.

### 4.5.3 — Teste end-to-end Stripe Live [S]

- Checklist obrigatório antes de marcar Fase 3 como concluída:
  - [ ] `stripe listen --forward-to localhost:5173/functions/v1/stripe-webhook`.
  - [ ] Subscrever Starter mensal com cartão `4242 4242 4242 4242` (em Test mode primeiro).
  - [ ] Verificar `tenants.plan_status='active'` + `stripe_subscription_id` populado.
  - [ ] Trocar para Pro via Portal → verificar webhook update.
  - [ ] Cancelar via Portal → verificar `plan_status='canceled'` + `stripe_subscription_id=null`.
  - [ ] Repetir em Live com cartão real (rejeitar de seguida + refund).
- Documentar resultado em `database/STRIPE_QA.md` (excepção autorizada à regra anti-`.md` — é runbook de QA).

### 4.5.4 — Página Billing com histórico de invoices Stripe [S]

- Hoje só tem botão "Gerir subscrição" (Portal Stripe).
- Adicionar widget "Últimas faturas" em `src/pages/Billing.tsx` que chama Stripe API via Edge Function `stripe-invoices` (nova) e lista últimos 12 invoices com download PDF.
- Ficheiros: `supabase/functions/stripe-invoices/index.ts` (novo), `src/components/billing/InvoiceHistory.tsx` (novo).

### Esforço total: ~2–3 dias.

---

<a id="p7"></a>
## PILAR 7 — Dívida técnica residual

Sem features novas; apenas saneamento. Todos os items podem entrar como side-quests entre pilares maiores.

### 7.1 — `i18n.ts` ainda bilingue FR/PT [S]

- Memory `project_pt_only_categoria.md` confirmou que schema é PT-only desde 2026-04-25, mas `src/lib/i18n.ts` continua com pares FR/PT.
- Decidir: **remover FR completamente** (mercado é PT-PT) e ficar só com strings PT inline ou um único dicionário.
- Tocar UI strings só onde for chamado.

### 7.2 — `any` em 31 ficheiros [M]

- CLAUDE.md diz "sem `any`" mas TS strict não está a ser respeitado em 31 ficheiros.
- Inventariar via `Grep ': any\\b'` e fixar 5 por dia até zero.
- Adicionar regra `@typescript-eslint/no-explicit-any: error` no `.eslintrc` quando atingir zero.

### 7.3 — Factory de query keys do React Query [S]

- Mencionado em CLAUDE.md como dívida: "4 padrões inconsistentes de invalidation".
- Criar `src/lib/queryKeys.ts`:
  ```ts
  export const qk = {
    invoices: { all: ['invoices'] as const, list: (tenantId: string) => ['invoices', tenantId] as const, detail: (id: string) => ['invoices', 'detail', id] as const },
    suppliers: { ... },
    reports: { ... },
  }
  ```
- Refactor incremental ao tocar.

### 7.4 — Actualizar CLAUDE.md [XS]

- Memory `project_claudemd_stale.md` confirma factos desactualizados:
  - `supabase/migrations/` **não está vazio** (vários migrations desde 04-19).
  - `InvoiceEditModal` **não existe** (só `InvoiceEditDialog` + `InvoiceEditForm`).
  - Rename `fournisseurs/` → `fornecedores/` está concluído.
- Reescrever a secção "Dívida técnica activa" no CLAUDE.md.

### 7.5 — Memory cleanup [XS]

- Marcar memories Pilar 1/5 como "verified outdated by Fase 3" ou actualizar em vez de pseudo-frescas.

### Esforço total: ~3 dias dispersos.

---

<a id="ordem"></a>
## ORDEM DE EXECUÇÃO RECOMENDADA (1 dev full-time, ~3 semanas)

**Semana 1 — Onboarding + dívida residual leve**
- Dia 1: Pilar 7.4 (CLAUDE.md), 7.1 (i18n PT-only). Pilar 1.5.1 (split drive.ts).
- Dia 2: Pilar 2 tarefa 1 (refactor 7→5 steps).
- Dia 3: Pilar 2 tarefa 2 (validação) + tarefa 4 (preview live).
- Dia 4: Pilar 2 tarefa 3 (dry-run prompt).
- Dia 5: Pilar 2 tarefa 5 (servidor=fonte) + tarefa 6 (telemetria) + QA onboarding.

**Semana 2 — Relatórios end-to-end**
- Dia 6: Pilar 3 tarefa 1 (schema) + 2 (backfill).
- Dia 7: Pilar 3 tarefa 3 (cron adaptado) + 4 (template brandado).
- Dia 8: Pilar 3 tarefa 5 (UI gestão).
- Dia 9: Pilar 3 tarefa 6 (send-report-now) + 7 (histórico+resend).
- Dia 10: Pilar 3 tarefa 8 (alertas) + 9 (índices) + QA.

**Semana 3 — Feature gating + QA Stripe + dívida**
- Dia 11: Pilar 4.5.1 (FeatureGate central). Aplicar em todos os sites.
- Dia 12: Pilar 4.5.2 (cron reset) + 4.5.4 (Billing invoice history).
- Dia 13: Pilar 1.5.2 (sync v2 mover entre abas) + 1.5.3 (split invoiceProcessor).
- Dia 14: Pilar 4.5.3 (QA Stripe Live end-to-end).
- Dia 15: Pilar 7.2 (eliminar `any`) + 7.3 (queryKeys) + code-reviewer + security-auditor + deploy.

---

<a id="metricas"></a>
## MÉTRICAS DE SUCESSO

| Métrica | Baseline (final Fase 2) | Target Fase 3 |
|---|---|---|
| Tempo médio de onboarding | desconhecido | ≤8 min |
| Taxa de signup→1ª fatura | desconhecida | ≥70% |
| Configs de relatório por tenant Pro | 1 (limitado) | média ≥1.5 (sinal de uso) |
| Tenants com pelo menos 1 dry-run no onboarding | 0% | 100% |
| `any` em código | 31 ficheiros | 0 |
| `drive.ts` LOC | 344 | <150 (split) |
| Stripe E2E em Live verificado | não | sim, documentado |
| Falhas de relatório alertadas <5min após 3ª falha | não | sim |

---

<a id="riscos"></a>
## RISCOS TRANSVERSAIS

1. **Migrar tenants em onboarding incompleto** (já têm steps antigos guardados) — fazer mapping antes de mexer no localStorage shape.
2. **Desligar `tenants.auto_reports` cedo demais** parte cron antigo. Plano: backfill → deploy novo cron a ler `report_configs` → 1 release de overlap → drop colunas antigas.
3. **Dry-run Gemini em onboarding** consome quota. Cap a 1 dry-run por tenant via flag.
4. **Email branding com logo** — alguns tenants têm `logo_url` apontando para Drive (privado). Garantir que a pipeline serve sempre via Storage público ou inline base64 ≤30KB.
5. **`useFeatureGate` aplicado retroactivamente** pode esconder UI que utilizadores actuais já viam. Audit ao aplicar — gate só quando há limit; `null`/loading nunca esconde.
6. **Tempo subestimado** — 3 semanas é optimista. Se atrasar, cortar 7.2 (`any` cleanup) para Fase 3.5.
7. **Google OAuth Verification** — limite de 100 grants ainda aplica. Onboarding novo não aumenta consumo. Monitorizar.

---

## NOTAS FINAIS

- Antes de cada commit significativo: `npm run build` + `npm run lint`.
- Antes de merge de pilar completo: `Agent subagent_type=code-reviewer` + `subagent_type=security-auditor`.
- Memories a actualizar à medida: `project_pilar1_state.md`, `project_pilar5_state.md`, `project_claudemd_stale.md`.
- Não pegar em coisas fora deste plano sem pedido. Pilar 5 candidatas (reconciliação bancária, API pública) ficam para Fase 4.
- Se houver re-prioritização durante a Fase 3 — actualizar **este** documento, não criar `PLAN_FASE3_v2.md`.
