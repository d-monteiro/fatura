# PLAN_FASE2.md — FaturaAI: Polir, Substituir Motor, Desbloquear Valor

> **Contexto (2026-04-24):** A Fase 1 (PLAN.MD) está maioritariamente implementada — multi-tenant, onboarding wizard (7 steps), Stripe checkout/webhook, Drive + Sheets + Gmail sync, cron de relatórios horário. Mas há **buracos operacionais críticos** (Stripe Price IDs não populados, onboarding sem dry-run do prompt, relatórios sem UI de customização) e **o motor de processamento** está atrás do que o projecto irmão `C:\Users\duart\Desktop\codigo\Flowzi\ai-fatura-pro` já tem (sync bidireccional, duplicate detection robusto, prompt afinado, rate limiter, token refresh automático).
>
> **Objectivo Fase 2:** entregar uma versão que (a) processa faturas com qualidade de produção, (b) onboarda qualquer utilizador sem suporte humano, (c) gera relatórios a sério, (d) cobra dinheiro de facto, (e) tem 2–3 features que justificam 39–79 EUR/mês.
>
> **Regra de ouro:** nada disto é nova arquitectura. É consolidação + portar código já escrito no `ai-fatura-pro` + tapar buracos. Seguir CLAUDE.md (anti-slop, ≤150 LOC por componente, sem `any`).

---

## ÍNDICE

1. [Pilar 1 — Swap do Motor de Processamento (ai-fatura-pro → fatura)](#p1)
2. [Pilar 2 — Onboarding à Prova de Burros (5 passos, gating hard)](#p2)
3. [Pilar 3 — Relatórios + Cron + Periodicidades (end-to-end)](#p3)
4. [Pilar 4 — Stripe: Preços Novos + Acesso Dashboard + Fix de Integração](#p4)
5. [Pilar 5 — Features de Valor (3 escolhidas + 2 candidatas)](#p5)
6. [Ordem de Execução Recomendada](#ordem)
7. [Métricas de Sucesso](#metricas)
8. [Riscos Transversais](#riscos)

---

<a id="p1"></a>
## PILAR 1 — Swap do Motor de Processamento

### Estado actual (o que temos)

- `src/lib/invoiceProcessor.ts` (242 LOC) — pipeline upload → analyze → save → Drive.
- `supabase/functions/analyze-document/` — chama OpenRouter/Gemini, prompt genérico tenant-aware em `_shared/promptBuilder.ts`.
- `src/lib/google/drive.ts` (402 LOC — split ao tocar, ver dívida técnica) — cria pastas por ano/mês.
- Sem sync bidireccional com Sheets: editamos na UI, Sheets fica desatualizado até próxima exportação manual.
- Duplicate detection inexistente ou fraca (confiamos apenas em `email_message_id` para emails).
- Sem rate limiter explícito nas chamadas a Gemini/Drive/Sheets (rely nos retries do SDK).
- Token refresh existe (`refresh-token/`), mas não é chamado preventivamente — só quando falha.

### O que o `ai-fatura-pro` tem a mais (inventário)

| # | Artefacto no ai-fatura-pro | O que traz | Dif. vs nosso |
|---|---|---|---|
| 1 | `src/lib/sync-engine.ts` | Pipeline Gmail → Gemini → Supabase + Drive + Sheets numa única transacção lógica, com partial-failure handling | Hoje estes passos estão espalhados |
| 2 | `src/lib/sync/updateInvoice.ts` + `EditInvoiceDrawer.tsx` | Edição bidireccional: user edita campo → UPDATE Supabase + batchUpdate Sheets; fallback se Sheets offline | Não temos; Sheets fica stale |
| 3 | Prompt Gemini em `supabase/functions/analyze-document/index.ts` (HCR) | Regras explícitas: Notas de Crédito, Via Verde, SIRCA, force-fields anti-misclassification; +15% accuracy | Prompt genérico |
| 4 | `src/lib/rateLimiter.ts` | Token bucket + backoff exponencial para Gemini (60/min) e Drive (100/min) | Não temos |
| 5 | Duplicate detection 3-strat em `sync-engine.ts:39-84` | (a) doc_number exacto, (b) supplier+date+amount+summary fuzzy, (c) hash do PDF | Só email_message_id |
| 6 | Token refresh preventivo (job diário + buffer 5min antes de usar) | Evita 401 em runtime | Reactivo apenas |
| 7 | `src/lib/appMode.tsx` (multi-cliente single codebase) | Switch dinâmico de tableName/paths/sidebar | Já temos via `TenantContext` — NÃO trazer |

### Target

- Motor de processamento com:
  - (a) prompt Gemini afinado + parametrizável por tenant (override por setor/cliente),
  - (b) duplicate detection em 3 estratégias,
  - (c) rate limiter em Gemini/Drive/Sheets,
  - (d) sync bidireccional Supabase ↔ Sheets em edições,
  - (e) refresh de token preventivo.
- Mantemos o modelo multi-tenant actual; nada de tabelas `invoices_hcr` / `invoices_petinga`.

### Tarefas (ordem)

1. **[S] Portar o prompt Gemini afinado**
   - Ler `ai-fatura-pro/supabase/functions/analyze-document/index.ts` linhas ~79–150 (regras HCR + force-fields).
   - Generalizar: retirar nomes "HCR", "Farinha", "FSE"; manter estrutura (regras de classificação, Notas de Crédito, Via Verde, force-fields).
   - Fundir com `fatura/supabase/functions/_shared/promptBuilder.ts` de forma a que `ai_prompt_config` do tenant (categorias, fornecedores conhecidos, nome-variantes) seja injectado.
   - Redeploy + testar com 3 faturas reais (PDF, JPEG, HEIC).
   - Ficheiros: `supabase/functions/analyze-document/index.ts`, `supabase/functions/_shared/promptBuilder.ts`.

2. **[S] Criar `src/lib/rateLimiter.ts`**
   - Portar 1:1 do `ai-fatura-pro`. Token bucket: Gemini 60/min, Drive 100/min, Sheets 100/min.
   - Wrapper `withRateLimit('gemini', fn)` usado por `analyze-document` (Edge) e por qualquer helper frontend que chame Drive/Sheets.
   - Ficheiro: `src/lib/rateLimiter.ts` + chamadas em `src/lib/google/drive.ts`, `src/lib/google/sheets.ts`.

3. **[M] Duplicate detection em 3 estratégias**
   - Função `isDuplicate(candidate: InvoiceDraft, tenantId: string): Promise<DuplicateMatch | null>` em `src/lib/invoiceProcessor.ts`.
   - Estratégia 1: `SELECT 1 FROM invoices WHERE tenant_id=? AND doc_number=? AND supplier_id=? LIMIT 1`.
   - Estratégia 2: supplier+date±2d+amount±0.01+summary fuzzy (pg_trgm `similarity >= 0.7`).
   - Estratégia 3: SHA-256 do PDF bruto (novo campo `invoices.file_hash TEXT`, index); migration nova em `supabase/migrations/`.
   - UI: `ProcessingOverlay` avisa "Fatura já existe — ver original?" com link.
   - Ficheiros: `src/lib/invoiceProcessor.ts`, nova migration, `src/components/upload/ProcessingOverlay.tsx`.

4. **[M] Sync bidireccional Sheets em edições**
   - Portar `ai-fatura-pro/src/lib/sync/updateInvoice.ts`.
   - Adaptar: após `supabase.from('invoices').update(...)`, chamar `sheetsUpdater.updateRow(tenant.sheets_spreadsheet_id, row, values)`.
   - Partial-failure: se Sheets falha, toast warning + log em `error_logs` com `severity='warn'`, não bloquear (fatura na BD é fonte da verdade).
   - Ficheiros: `src/lib/sync/updateInvoice.ts` (novo), `src/lib/google/sheets.ts` (adicionar `batchUpdateRow`), `src/components/faturas/InvoiceEditDialog.tsx` (hook de save).
   - **NOTA:** aproveitar para resolver a dívida técnica `InvoiceEditDialog` vs `InvoiceEditModal` (consolidar num só).

5. **[S] Token refresh preventivo**
   - Cron já existe (`sync-email` a 23:58). Adicionar cron novo a cada 30min que chama `refresh-token` para tokens com `expires_at < now() + 10min`.
   - Alternativa: wrapper `getValidAccessToken(userId)` em `src/lib/google/oauth.ts` que refresca in-place se `expires_at - now() < 5min` antes de devolver.
   - Escolher o wrapper (mais robusto, menos cron). Ficheiro: `src/lib/google/oauth.ts`.

6. **[S] Split do `drive.ts` (402 LOC)**
   - Já devia ter sido feito; é pré-requisito para tocar no ficheiro.
   - Dividir em `drive/client.ts` (auth+request), `drive/folders.ts` (hierarquia), `drive/upload.ts`, `drive/search.ts`.
   - Ficheiros: `src/lib/google/drive/*`.

### Ficheiros afectados (resumo)

`supabase/functions/analyze-document/index.ts`, `supabase/functions/_shared/promptBuilder.ts`, `src/lib/rateLimiter.ts` (novo), `src/lib/invoiceProcessor.ts`, `src/lib/sync/updateInvoice.ts` (novo), `src/lib/google/drive/*` (split), `src/lib/google/sheets.ts`, `src/lib/google/oauth.ts`, `src/components/faturas/InvoiceEditDialog.tsx`, nova migration para `file_hash`.

### Riscos

- **Prompt regression:** mudar prompt pode baixar accuracy em tenants actuais. Mitigar com suite de ≥10 faturas-teste guardadas em `supabase/functions/_shared/fixtures/` e comparar output antes/depois.
- **Deadlock Sheets:** se `updateRow` demorar >30s, UI fica presa. Fire-and-forget com toast "a sincronizar" e reconcile em background.
- **Migration do `file_hash`:** backfill em tenants existentes pode ser caro; fazer em batches de 500.

### Esforço total: ~6–8 dias de trabalho focado.

---

<a id="p2"></a>
## PILAR 2 — Onboarding à Prova de Burros

### Estado actual

- 7 steps: Empresa, Invoice Intel, Storage, Dashboard, Automation, Review, Payment.
- Gating existe (`RequireTenant.tsx:44-46` bloqueia app até `onboarding_completed=true OR setup_status='ready'`).
- Persistência em localStorage (`useOnboardingStorage.ts`) — resume em refresh.
- Gera `ai_prompt_config` + `invoice_name_variations[]` em `lib/onboarding/finalize.ts`.

### Buracos identificados

- Demasiados steps (7) — retirar ou fundir.
- Sem validação séria de `invoiceNameVariations` (pode submeter vazio → prompt inútil).
- Step Review só lista o que inseriste; não dá warnings para campos que vão afectar qualidade.
- **Nunca testamos o prompt** antes de o guardar — tenant pode ficar com prompt mau e só descobre quando processa a 1ª fatura.
- Explicações visuais fracas: user não percebe porque importa cada pergunta.
- Logo em localStorage base64 (pesado); upload para `tenants.logo_url` só no finalize.
- Sem "modo burro": se o user carrega no botão voltar do browser a meio do wizard, o localStorage fica inconsistente com o servidor.

### Target

- **5 passos no máximo**, cada um com:
  - Título + 1 frase explicativa do **porquê**.
  - Validação agressiva (impossível avançar com lixo).
  - Preview live do efeito (ex.: ver como ficará a sidebar com o logo + cor).
- **Dry-run do prompt** no último step: processar 1 fatura de exemplo (carregada pelo utilizador ou default Flowzi) e mostrar o que o Gemini extrai. Se não sair bem, user pode ajustar `invoiceNameVariations` / categorias antes de pagar.
- Gating absoluto: qualquer rota (excepto `/onboarding/*`, `/settings/billing`, `/logout`) redirecciona para o step em curso.

### Riscos

- Remover steps pode eliminar campos que outras features usam (ex.: `invoicesPerMonth` para pricing display). Auditar antes de apagar.
- Dry-run custa 1 chamada Gemini por tenant; é aceitável (trial).
- Retomar a meio: se o user fecha o browser no step 3 e volta, estado do localStorage pode estar à frente do servidor. Fonte da verdade = `onboarding_submissions` (servidor).


---

<a id="p3"></a>
## PILAR 3 — Relatórios + Cron + Periodicidades

### Estado actual

- Tabela `report_deliveries` (tenant_id, period_kind, period_start, period_end, status, sent_at, error, email_to, invoices_count).
- Edge Function `send-auto-reports` com cron horário (`0 * * * *`), filtra por timezone local do tenant.
- UI: `ReportsCard.tsx` em Settings — dropdown "Never / Weekly (seg 08h) / Monthly (dia 1 08h)".
- Email template hardcoded em `reportEmail.ts`.
- Cron em `database/CRON.sql` — confirmados: `sync-email-daily` (23:58 UTC), `send-auto-reports-hourly`.

### Buracos

- User configura frequência mas **não escolhe conteúdo do relatório** (KPIs, gráficos, que empresa/categoria). Sempre o mesmo resumo.
- Sem preview/teste ("Enviar-me agora um relatório de exemplo").
- `report_deliveries` sem índice `(tenant_id, period_kind, period_start DESC)` — lento quando escalar.
- Sem alertas de falha recorrente (se 3 reports seguidos falham, devia notificar via Slack).
- Sem relatórios ad-hoc ("exportar relatório do mês passado agora").
- Template de email é genérico; sem cores/logo do tenant.

### Target

- UI de configuração de relatórios com:
  - Frequência (diário / semanal — escolher dia / mensal — escolher dia / trimestral).
  - Destinatários (múltiplos emails).
  - Conteúdo: checkboxes (total de faturas, total por fornecedor, categorias, gráficos, top 10 despesas, alertas de anomalias).
  - Scope: todas as empresas vs. filtrar por `company_id` / `category`.
  - Hora de envio (slider de hora local).
  - Botão "Enviar de teste agora".
- Template de email HTML com branding do tenant (logo, cor primária).
- Dashboard de "Relatórios enviados" com histórico e re-send.
- Alertas de falha (≥3 consecutivas) via Slack + email.

### Tarefas

1. **[M] Schema de `report_configs`**
   - Nova tabela `report_configs (id, tenant_id, name, frequency enum, send_day int, send_hour int, recipients text[], content_options jsonb, filters jsonb, active boolean, created_at, updated_at)`.
   - 1 tenant pode ter N configs (ex.: "Semanal para o contabilista", "Mensal para o CEO").
   - Migration + RLS `tenant_id = current_tenant_id()`.
   - Ficheiros: `supabase/migrations/XXX_report_configs.sql`, `src/types/database.ts` (re-generate).

2. **[S] Adaptar cron ao novo schema**
   - `send-auto-reports` passa a iterar `report_configs WHERE active=true` e gera email por cada.
   - Deprecar `tenants.auto_reports` e `tenants.report_email` (ou migrar para 1 config default).
   - Ficheiros: `supabase/functions/send-auto-reports/index.ts`.

3. **[M] UI de gestão de relatórios**
   - Nova página `src/pages/settings/Reports.tsx` ou aba em Settings.
   - Componentes: `ReportConfigList`, `ReportConfigForm`, `ReportContentPicker`.
   - Botão "Enviar de teste agora" chama endpoint `send-report-now` (novo) com `?dry_run=false&recipients_override=me@...`.
   - Ficheiros: `src/components/reports/*`, `src/pages/settings/Reports.tsx`.

4. **[S] Email template brandado**
   - React Email (instalar `@react-email/components`) ou manter HTML inline mas com `tenants.logo_url`, `tenants.primary_color`.
   - Ficheiro: `supabase/functions/_shared/reportEmail.ts`.

5. **[S] Histórico + Re-send**
   - Usar `report_deliveries` já existente — juntar com `report_configs` via FK.
   - UI: tabela paginada, filtros por config, status, período.
   - Botão "Re-enviar" chama `send-report-now?delivery_id=...`.

6. **[S] Alertas de falha**
   - Após cada `send-auto-reports`, query `COUNT(*) FROM report_deliveries WHERE config_id=? AND status='error' ORDER BY created_at DESC LIMIT 3`.
   - Se 3 seguidos → chamar `slack-notify` com template "3 falhas consecutivas no report {name}".

7. **[S] Índices**
   - `CREATE INDEX ON report_deliveries (tenant_id, period_kind, period_start DESC)`.
   - `CREATE INDEX ON report_deliveries (config_id, created_at DESC)` (quando FK existir).

### Ficheiros afectados

`supabase/migrations/XXX_report_configs.sql`, `supabase/functions/send-auto-reports/index.ts`, `supabase/functions/send-report-now/index.ts` (novo), `supabase/functions/_shared/reportEmail.ts`, `src/pages/settings/Reports.tsx` (novo), `src/components/reports/*` (novo), `src/types/database.ts`.

### Riscos

- Migração de `auto_reports` + `report_email` sem quebrar tenants actuais: script que cria 1 `report_configs` por tenant activo antes de desactivar as colunas antigas.
- Cron horário pode acumular com muitos tenants — se >200 configs, paralelizar com `Promise.all` em batches.

### Esforço total: ~5–6 dias.

---

<a id="p4"></a>
## PILAR 4 — Stripe: Preços Novos + Acesso Dashboard + Fix de Integração

### Estado actual

- Edge Functions `stripe-checkout` e `stripe-webhook` existem.
- `stripe-portal` **referenciado no código mas pode não estar deployado** — confirmar.
- Tabela `plans` com colunas `stripe_price_id_monthly` / `stripe_price_id_yearly`.
- **Os Price IDs não estão populados na BD** (auditoria confirmou). Checkout vai partir.
- Webhook não valida assinatura (`stripe-signature`) explicitamente — verificar `verifyWebhook`.
- UI: `PlanSelector` carrega dinamicamente — OK.
- Sem toggle test/production visível.

### Target

- Produtos Stripe criados/actualizados em Live mode com os preços novos (a definir pelo user).
- Price IDs populados em `plans` via seed ou script.
- Webhook com validação de assinatura correcta.
- `stripe-portal` deployado + botão "Gerir subscrição" na Billing page.
- Teste end-to-end em Live (com test card da Stripe em `stripe-cli listen`).

### Tarefas (bloqueadas por input do user)

> **BLOCKER:** preciso que me dês acesso ao Stripe Dashboard (conta partilhada, role developer) OU que faças os passos 1–3 manualmente. Passos 4+ são código.

1. **[user, manual] Pedido de acesso ao Dashboard Stripe**
   - Convidar `duartemmonteiro2005@gmail.com` com role Developer em https://dashboard.stripe.com/settings/team.
   - Confirmar que a conta está em modo Live e verificada (empresa PT, IBAN confirmado).

2. **[user+code] Criar/actualizar produtos no Stripe**
   - Decidir preços novos (exemplo placeholder, substituir):
     - **Starter:** 29 EUR/mês ou 290 EUR/ano (100 faturas/mês, 1 empresa, Drive+Sheets).
     - **Pro:** 69 EUR/mês ou 690 EUR/ano (500 faturas, 3 empresas, Gmail sync, relatórios custom).
     - **Empresarial:** custom, contacto comercial (>500 faturas, multi-user, Slack integration, SLA).
   - Criar em Live com `stripe products create` (ou UI) — gerar `price_id` por billing cycle.
   - Atualizar `database/SEED.sql` / migration com os novos `stripe_price_id_*`.

3. **[S] Script de populate de Price IDs**
   - `scripts/seed-stripe-prices.ts` que lê de `.env` (`STRIPE_PRICE_STARTER_MONTHLY`, etc.) e faz UPDATE em `plans`.
   - Ficheiro: `scripts/seed-stripe-prices.ts`.

4. **[S] Validar webhook signature**
   - Em `supabase/functions/stripe-webhook/index.ts`, usar `stripe.webhooks.constructEventAsync(body, signature, webhookSecret)` — não apenas `constructEvent`.
   - Tratar `StripeSignatureVerificationError` → 400.
   - Secret já existe em Supabase (`STRIPE_WEBHOOK_SECRET`).
   - Ficheiro: `supabase/functions/stripe-webhook/index.ts`.

5. **[S] Deploy `stripe-portal`**
   - Confirmar se existe; se não, criar Edge Function que chama `stripe.billingPortal.sessions.create({ customer: tenant.stripe_customer_id, return_url })`.
   - Botão "Gerir subscrição" em `src/pages/Billing.tsx`.
   - Ficheiros: `supabase/functions/stripe-portal/` (novo se não existir), `src/pages/Billing.tsx`.

6. **[S] Feature gating central**
   - Hoje está espalhado (`tenant?.plan?.has_*`).
   - Criar `src/hooks/useFeatureGate.ts`: `useFeatureGate('reports_custom') → { allowed: boolean, reason: string }`.
   - Componente `<FeatureGate feature="..."><...>`</> que mostra upgrade prompt se locked.
   - Usar em todo lado onde o feature está atrás de um plano.
   - Ficheiros: `src/hooks/useFeatureGate.ts`, `src/components/common/FeatureGate.tsx`.

7. **[S] Usage enforcement**
   - Em `analyze-document`, antes de processar, SELECT `tenants.invoices_this_month, plans.invoice_limit` e rejeitar com 402 se atingir.
   - Reset mensal via cron (`0 0 1 * *`).
   - Ficheiros: `supabase/functions/analyze-document/index.ts`, `supabase/functions/_shared/usage.ts`.

8. **[S] Teste end-to-end**
   - `stripe listen --forward-to localhost:5173/functions/v1/stripe-webhook`.
   - Subscrever com cartão `4242 4242 4242 4242`.
   - Verificar: `tenants.plan_status='active'`, `stripe_subscription_id` populado, email de welcome (opcional).
   - Cancelar via Portal → verificar webhook → `plan_status='canceled'`.

### Riscos

- Mudar `plans.stripe_price_id_*` em produção quebra checkout de novos tenants até ficar consistente. Fazer em maintenance window ou transacção atómica.
- Price changes em Stripe: **não alteram** subscrições existentes. Se quiseres forçar clientes actuais para preços novos, usar Stripe API para migrar subscriptions — cuidado legal.
- Webhook idempotente: eventos podem chegar duplicados (Stripe garante "at least once"). Guardar `processed_stripe_event_ids` para dedup.

### Esforço total: ~3–4 dias (sem contar espera por acesso).

---

<a id="p5"></a>
## PILAR 5 — Features de Valor

> Critério de selecção: (a) impacto directo em retenção/upsell, (b) usa IA/Google que já temos, (c) esforço S ou M, (d) diferencia do Moloni/InvoiceXpress.

### Escolhidas (3)

#### 5.1 — Exportação SAF-T para contabilista (**S/M**)

- **Porquê:** em PT, o contabilista precisa de SAF-T (PT) ou ficheiros compatíveis (Primavera, Sage, Visma). Hoje o cliente exporta Excel e reformata à mão.
- **O quê:** botão "Exportar para contabilista" em Faturas → gera `.zip` com (a) SAF-T XML do período seleccionado, (b) PDFs originais de todas as faturas, (c) Excel resumo.
- **Como:**
  - Portar/adaptar schema SAF-T PT da AT (v1.04_01) — mapping directo de `invoices` + `invoice_line_items` + `suppliers`.
  - Biblioteca: `xmlbuilder2` (JS nativo).
  - Edge Function nova `export-saft/` que constrói XML e devolve URL temporária (Supabase Storage signed URL, 24h).
  - UI em Faturas com picker de período.
- **Ficheiros:** `supabase/functions/export-saft/`, `src/components/faturas/SaftExport.tsx`.
- **Esforço:** 4 dias.
- **Feature gate:** Pro+.

#### 5.2 — Alertas de prazo de pagamento + Dashboard "Contas a Pagar" (**S**)

- **Porquê:** clientes PME sempre reclamam "paguei esta em duplicado" ou "esta esqueci-me". Diferencia de competidores que só tratam de faturação emitida.
- **O quê:** campo `invoices.due_date` (extraído pelo Gemini, já disponível no prompt). Dashboard widget "Contas a pagar nos próximos 30 dias" + notificação (email ou Slack) quando `due_date` chega a T-3 dias.
- **Como:**
  - Adicionar `due_date` ao prompt + ao schema (se não existe; verificar).
  - Cron diário (`0 8 * * *` local) percorre `invoices WHERE due_date BETWEEN now() AND now()+interval '3 days' AND paid_at IS NULL`.
  - Envia email/Slack; regista em `notifications` table.
  - Widget no Dashboard existente.
- **Ficheiros:** migration (se preciso), `supabase/functions/check-due-dates/index.ts` (novo), `src/components/dashboard/UpcomingPayments.tsx`.
- **Esforço:** 2–3 dias.
- **Feature gate:** Starter+ (básico) / Pro (Slack + custom thresholds).

#### 5.3 — Detecção de faturas duplicadas (no Pilar 1 já vai, mas expor em UI) (**S**)

- **Porquê:** resposta directa a "paguei esta em duplicado". Primeira coisa que gera confiança.
- **O quê:** widget "Possíveis duplicados detectados (3)" no Dashboard, clica → listagem de pares de faturas similares, utilizador decide se apaga/mantém.
- **Como:** já temos a lógica (Pilar 1 tarefa 3). Só preciso de UI que mostre pares + acção "marcar como duplicado" (soft delete na secundária).
- **Ficheiros:** `src/components/dashboard/DuplicatesWidget.tsx`, `src/pages/Faturas.tsx` (aba ou drawer).
- **Esforço:** 2 dias.
- **Feature gate:** todos os planos.

### Candidatas (2 — para Fase 3)

- **Reconciliação bancária** (match com extracto Revolut/Stripe/MBWay): valor altíssimo mas precisa de integração OAuth com Revolut Business / scraper MBWay — L/XL. Deixar para depois de validação dos 3 acima.
- **API pública + webhooks** (POST /api/v1/invoices, webhooks `invoice.created`): destrava integrações com ERPs; valor enorme para Empresarial, mas só se tivermos demand — M/L.

### Métricas de sucesso das features

- SAF-T: ≥30% dos tenants Pro exportam pelo menos 1x/mês nos primeiros 2 meses.
- Alertas: ≥50% dos utilizadores activam.
- Duplicados: ≥10% dos tenants clicam no widget na 1ª semana.

---

<a id="ordem"></a>
## ORDEM DE EXECUÇÃO RECOMENDADA (para 1 dev, full-time, 3–4 semanas)

**Semana 1 — Base do motor**
- Dia 1: Pilar 1 — tarefas 1 (prompt) + 2 (rate limiter).
- Dia 2: Pilar 1 — tarefa 3 (duplicates) + migration.
- Dia 3: Pilar 1 — tarefa 6 (split drive.ts) — pré-requisito para tocar qualquer coisa de Drive.
- Dia 4: Pilar 1 — tarefa 4 (sync bidireccional Sheets) + consolidar `InvoiceEditDialog`.
- Dia 5: Pilar 1 — tarefa 5 (token refresh) + testes end-to-end com 3 faturas reais.

**Semana 2 — Onboarding à prova de burros + Stripe base**
- Dia 6: Pilar 4 — pedir acesso Stripe, criar produtos Live, popular BD. Pilar 4 tarefas 1–3.
- Dia 7: Pilar 4 — tarefas 4, 5, 8 (webhook + portal + teste).
- Dia 8–10: Pilar 2 — redesenhar 5 steps, validação, dry-run, gating. Tarefas 1–6.

**Semana 3 — Relatórios + Feature gating**
- Dia 11: Pilar 3 — tarefa 1 (schema `report_configs`) + 2 (adaptar cron).
- Dia 12–13: Pilar 3 — tarefas 3, 4 (UI + template brandado).
- Dia 14: Pilar 3 — tarefas 5, 6, 7 (histórico, alertas, índices).
- Dia 15: Pilar 4 — tarefas 6, 7 (feature gating + usage enforcement).

**Semana 4 — Features de valor + QA**
- Dia 16–18: Pilar 5.1 — SAF-T export.
- Dia 19: Pilar 5.2 — alertas due_date.
- Dia 20: Pilar 5.3 — UI de duplicados.
- Dia 21: QA end-to-end, security audit (agente), code review (agente), deploy.

---

<a id="metricas"></a>
## MÉTRICAS DE SUCESSO DA FASE 2

| Métrica | Baseline | Target |
|---|---|---|
| Accuracy extração Gemini (campos críticos) | ~85% | ≥95% |
| Taxa de onboarding completo (signup → primeira fatura) | desconhecida | ≥70% |
| Tempo médio de onboarding | desconhecido | ≤8 min |
| Checkout Stripe funcional em Live | 0% | 100% |
| Relatórios enviados com sucesso | ? | ≥99% |
| MRR (assumindo 5 tenants beta a 39 EUR) | 0 | 195 EUR/mês ao fim da Fase 2 |

---

<a id="riscos"></a>
## RISCOS TRANSVERSAIS

1. **Prompt regression em tenants existentes** (LGM, outros pilotos) — mitigar com fixtures.
2. **Stripe em Live** — qualquer bug cobra ou refunde mal. Teste obrigatório com `stripe-cli` + test card antes de switch.
3. **Migration SQL** — sempre com `BEGIN; ... COMMIT;` e testada em branch Supabase primeiro.
4. **OAuth Google Verification** — limite de 100 grants ainda aplica. Pilar 1 não aumenta consumo. Monitorizar contagem.
5. **Tempo subestimado** — 3–4 semanas é optimista para dev único. Se atrasar, cortar Pilar 5 (features de valor) e deixar para Fase 2.5.

---

## NOTAS FINAIS

- Não criar ficheiros `.md` novos sem pedido (regra anti-slop). Este documento é o único plan da Fase 2.
- Antes de cada commit significativo: correr `npm run build` + `npm run lint`.
- Antes de merge de pilar completo: `Agent subagent_type=code-reviewer` + `subagent_type=security-auditor`.
- Memory `project_tech_debt.md` deve ser actualizada à medida que resolvermos dívidas (split drive.ts, consolidar EditDialog, i18n FR→PT, etc.).
- Se o `ai-fatura-pro` tiver updates durante a migração, fazer commit final antes de começar e não voltar a puxar — evitar moving target.
