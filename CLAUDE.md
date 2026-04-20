# FaturaAI

SaaS de faturação multi-empresa com IA (OCR + extração). Mercado: PT. Dev único.

## Stack real (verificar sempre em `package.json`)

- React 19 + Vite 8 + TypeScript 5.9 (strict, zero erros no build)
- Shadcn/UI + Tailwind 4
- TanStack React Query 5 (server state) + React Context (auth, i18n, tenant, errors)
- React Router 7
- Supabase (Postgres + Auth + Storage + Edge Functions) — ref `sxfwprydmllovnxxjhrh`
- IA: OpenRouter → Gemini 2.5 Pro (visão directa, sem OCR separado)
- Google APIs: Drive (hierarquia de pastas), Sheets (export), Gmail (sync cron 23:58)
- Export: SheetJS (.xlsx) + JSZip
- Deploy: Vercel (FE) + Supabase Cloud (BE)
- **Sem** react-hook-form, sem zod, sem lib de i18n (Context caseiro).

## Database & Infrastructure

- Always use Supabase MCP to verify actual database state (tables, columns, constraints, RLS policies) BEFORE proposing fixes. Don't assume schema matches code.
- When deploying Edge Functions, use the existing `source/` path layout and `config.toml` conventions; don't regenerate scaffolding.
- Check storage buckets, RLS INSERT policies, and unique constraints early when diagnosing data/insert errors.

## Idioma

- UI e código (identifiers, comentários, commits) em **PT-PT** com acordo ortográfico.
- Codebase nasceu em francês — ver memory `project_fr_to_pt.md`. Rename `fournisseurs/` → `fornecedores/` em curso. Terminologia: fornecedor, IVA, NIF, autoliquidação IVA (nunca TVA/SIRET em código novo).

## Regras não negociáveis (anti-slop)

Esta codebase foi marcada pelo dono como "AI slop". Antes de escrever qualquer linha:

1. **Grep primeiro, escrever depois.** Se existe algo parecido, consolidar em vez de duplicar. Alvos: `src/types/database.ts` (enums), `src/lib/utils/`, `src/components/ui/`.
2. **Componentes ≤150 linhas.** Se o ficheiro existente já viola, split ao tocar. Não agravar.
3. **Sem comentários decorativos.** Nada de JSDoc a repetir o nome da função. Só comentários para *porquê* não óbvio.
4. **Sem `try/catch { return null }` silencioso.** Logar ou propagar.
5. **Sem `any` nem `Record<string, unknown>`** como escape hatch. Definir o tipo.
6. **Sem abstracções preventivas.** YAGNI. Três linhas repetidas > factory prematura.
7. **Sem ficheiros `.md` novos** (planos, análises, READMEs) sem pedido explícito.
8. **Não inventar features.** Só o que foi pedido.
9. Formatar EUR: `1 234,56 EUR`. Datas: `DD/MM/AAAA`.

## Root Cause Discipline

- Fix root causes, not symptoms. If a UI spacing issue traces to a parent container's padding, fix the parent — don't patch with margin tweaks on the child.
- Before iterating on errors (e.g., HogQL, OAuth, CORS), read the relevant docs/configuration first rather than guessing through repeated deploys.

## Segurança (crítico)

- API keys **nunca** no frontend — só Edge Functions via `Deno.env.get`.
- RLS em todas as tabelas, usando `(select auth.uid())` (não `auth.uid()` bare).
- Edge Functions verificam JWT via `supabase.auth.getUser()`.
- CORS whitelist via env `ALLOWED_ORIGINS` (ver [supabase/functions/_shared/cors.ts](supabase/functions/_shared/cors.ts)). Default: `fatura.flowzi.pt` + `localhost:5173`. Nunca `*`.
- Soft delete (`deleted_at`). Nunca DELETE real em faturas.
- Audit log em mutações de faturas.
- OAuth state parameter deve ser HMAC-assinado (pendente — C3).
- Bucket `invoices` deve ser privado (pendente — H1).
- Tokens OAuth encriptados at rest com pgcrypto (pendente — H2).

## Setup Google Cloud Console (manual)

OAuth Google usa scopes sensíveis (`gmail.readonly`, `gmail.modify`) que exigem Google Verification para produção aberta. Enquanto em Testing:

1. `console.cloud.google.com` → APIs & Services → OAuth consent screen
2. User type: **External**, Publishing status: **Testing**
3. **Test users**: adicionar cada email que vai ligar-se via OAuth (até 100). Obrigatório — senão Google bloqueia com `access_denied`.
4. Scopes centralizados em [src/lib/google/scopes.ts](src/lib/google/scopes.ts). Helper único de redirect: [src/lib/google/oauth.ts](src/lib/google/oauth.ts) (`redirectToGoogleOAuth`). Nunca construir URLs OAuth à mão.
5. Scope Gmail: **só** `gmail.readonly` (sensitive, sem CASA). Não usar `gmail.modify` (restricted, exige CASA $$). Dedup de emails feito em BD via `email_message_id`, sem labels.
6. Ir a prod aberto: submeter para Google Verification (demo-video + justificação dos scopes).

## Armadilhas conhecidas

- **Auth deadlock:** nunca `await` Supabase dentro de `onAuthStateChange` — `navigator.locks` deadlock.
- **Auth loading:** usar three-way `loading ? null : isAuthenticated ? x : y`.
- **RLS recursion:** policies que re-query a mesma tabela exigem helpers `SECURITY DEFINER`.
- **Edge secrets:** adicionar secret no dashboard exige REDEPLOY da função.
- **Gemini wrapping:** às vezes devolve ```json envolvido; limpar antes de `JSON.parse`.
- **Parsing números PT/FR:** vírgula decimal, espaço milhares. Nunca assumir formato US.
- **HEIC iPhone:** converter para JPEG server-side antes do Gemini.

## Comandos

```bash
npm run dev      # localhost:5173
npm run build    # tsc -b && vite build — correr SEMPRE antes de terminar
npm run lint     # ESLint 9 (passa clean; mantê-lo assim)
```

## Estrutura real

```
src/
  components/
    ui/              shadcn (15)
    common/          LoadingSpinner
    layout/          AppLayout, Sidebar, MobileHeader, CompanySelector
    dashboard/       MetricCard, TrendChart, CategoryDonut, RecentInvoicesTable
    faturas/         Table, Filters, Drawers, Edit* (DUPLICADOS — ver tech_debt)
    upload/          DropZone, ProcessingOverlay, StatusCards
    inbox/           InboxCard
    settings/        CompanyList, EmailAccounts, GoogleAccounts
    automations/     ConnectedAccounts, CheckEmails, AccountRow
    fornecedores/    SupplierDetailModal, SupplierEditForm (rename em curso)
    onboarding/      Wizard + Steps (vários >150 LOC)
    billing/         PlanSelector
    landing/         Hero, Pricing, FAQ, CTA
    tickets/         FeedbackWidget, NewTicketForm
  contexts/          Auth, I18n, Tenant, Errors
  hooks/             useUploadDeps
  lib/
    supabase/client.ts
    google/drive.ts       (402 LOC — split ao tocar)
    google/sheets.ts
    gemini.ts             frontend → Edge Function
    invoiceProcessor.ts   pipeline upload→analyze→save→drive (242 LOC)
    errors/errorReporter.ts
    utils/validation.ts, utils/suppliers.ts
    i18n.ts               pares FR/PT (decidir futuro)
  pages/             Dashboard, Inbox, Faturas, Upload, Fornecedores, Settings,
                     Automations, Login, Billing, Tickets, Onboarding, Landing,
                     NotFound, admin/{Errors,Onboarding,Tenants,Tickets}
  types/             database.ts (260 LOC), tenant.ts (163 LOC)

database/            SCHEMA.sql, RLS_POLICIES.sql, CRON.sql (manual, não CLI)
supabase/
  migrations/        VAZIO — sem versionamento de DB (dívida)
  functions/
    analyze-document/    OpenRouter → Gemini 2.5 Pro
    sync-email/          Gmail cron 23:58
    oauth-callback/      Google OAuth redirect
    refresh-token/       renova tokens (5min buffer)
    slack-notify/        notificações enterprise
    _shared/             promptBuilder tenant-aware
```

## Edge Function secrets (`Deno.env.get`)

`OPENROUTER_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `FRONTEND_URL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.

## Frontend env (`VITE_*`)

`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_GOOGLE_CLIENT_ID`.

## Rate limits / timeouts

- Gemini: 60 req/min, timeout 120s.
- Drive: 100 req/min, upload 120s / ops 30s.
- Sheets: 100 req/min, 30s.
- Gmail: 250 quota units/user/sec.

## Dívida técnica ativa (atacar antes de features novas)

Detalhe em memory `project_tech_debt.md`. Resumo:

- Duplicados: `InvoiceEditDialog` vs `InvoiceEditModal`; 8× redefinição de `METIERS`/`NATURES`/`COST_TYPES`.
- Falta factory de query keys (4 padrões inconsistentes de invalidation).
- God components: OnboardingWizard 271 LOC, drive.ts 402 LOC, invoiceProcessor 242 LOC.
- `supabase/migrations/` vazio — DDL manual em `database/SCHEMA.sql` com DROP no topo.
- `any` em 31 ficheiros apesar de `strict: true`.
- `i18n.ts` ainda bilingue FR/PT — decidir.
- Rename `fournisseurs/` → `fornecedores/` incompleto.

## Fluxo

- Explorações >3 queries → `Agent` com `subagent_type=Explore`.
- Antes de commits importantes → `Agent` com `subagent_type=code-reviewer` (em `.claude/agents/`).
- Antes de deploy → `Agent` com `subagent_type=security-auditor` (em `.claude/agents/`).
- Skill global `simplify` para review de código alterado.
- Memory em `~/.claude/projects/-home-up202306122-Flowzi-fatura/memory/` — `MEMORY.md` é o índice.
