# PLAN.md — FaturaAI SaaS: De Single-Tenant a Plataforma Multi-Tenant

> **Contexto:** Temos uma plataforma de faturação com IA funcional para um cliente (LGM, construção civil francesa). O objetivo é transformar isto num SaaS multi-tenant "done-for-you" onde qualquer empresa europeia pode subscrever, responder a um questionário de onboarding, e ter a sua plataforma configurada automaticamente — sem intervenção humana.
>
> **Stack atual:** React 18 + Vite + TypeScript + Tailwind 4 + Shadcn/UI | Supabase (PostgreSQL + Auth + Edge Functions + Storage) | OpenRouter → Gemini 2.5 Pro | Google Drive/Sheets API | Gmail API
>
> **Supabase:** `wvopuqyotvwgronujvrb` (já existente e configurado — reutilizar este projeto)
>
> **Deploy:** Vercel (frontend) + Supabase Cloud (backend)

---

## ÍNDICE

1. [Fase 0 — Fundação: Arquitetura Multi-Tenant](#fase-0)
2. [Fase 1 — Schema Multi-Tenant + Migração](#fase-1)
3. [Fase 2 — Auth, Roles e Tenant Isolation](#fase-2)
4. [Fase 3 — Onboarding Questionnaire (20 perguntas)](#fase-3)
5. [Fase 4 — Landing Page + Marketing Site](#fase-4)
6. [Fase 5 — Stripe Integration + Billing](#fase-5)
7. [Fase 6 — AI Engine: Tenant-Aware Prompt System](#fase-6)
8. [Fase 7 — Integrations Hub (Drive, Sheets, Gmail, Outlook)](#fase-7)
9. [Fase 8 — Dashboard Multi-Tenant](#fase-8)
10. [Fase 9 — Ticket System + Feedback + Slack Integration](#fase-9)
11. [Fase 10 — Error Logging & Observability](#fase-10)
12. [Fase 11 — Admin Panel (Nosso Backoffice)](#fase-11)
13. [Fase 12 — Testing, Security Audit, Launch Prep](#fase-12)
14. [Convenções de Código](#convencoes)
15. [Armadilhas Conhecidas](#armadilhas)
16. [Checklist de Deploy](#checklist-deploy)

---

<a id="fase-0"></a>
## FASE 0 — Fundação: Arquitetura Multi-Tenant ✅

### 0.1 Decisão de Arquitetura Multi-Tenant

Usamos **shared database, shared schema** com `tenant_id` em todas as tabelas. Razões:
- Custo mais baixo (1 Supabase project)
- Mais simples de operar e fazer deploy
- RLS do Supabase resolve o isolamento de dados
- Escala bem até ~500 tenants (muito além do nosso target inicial)

**CRÍTICO:** Toda a query, toda a policy, todo o Edge Function DEVE filtrar por `tenant_id`. Um leak de dados entre tenants é o pior cenário possível.

### 0.2 Supabase Project (JÁ EXISTENTE)

O projeto Supabase já existe e está configurado: **`wvopuqyotvwgronujvrb`**. NÃO criar um novo projeto. Vamos evoluir o schema existente para multi-tenant adicionando `tenant_id` às tabelas existentes e criando as novas tabelas necessárias.

As Edge Functions existentes (`analyze-document`, `sync-email`, `oauth-callback`, `refresh-token`) já estão deployadas e funcionais — vão ser adaptadas para multi-tenant, não reescritas do zero.

**Secrets já configuradas no Supabase Dashboard:**
```
OPENROUTER_API_KEY          # ✅ Já existe
GOOGLE_CLIENT_ID            # ✅ Já existe
GOOGLE_CLIENT_SECRET        # ✅ Já existe
SUPABASE_URL                # ✅ Já existe
SUPABASE_SERVICE_ROLE_KEY   # ✅ Já existe
SUPABASE_ANON_KEY           # ✅ Já existe
FRONTEND_URL                # ✅ Já existe
```

**Secrets NOVAS a adicionar ao Supabase Dashboard antes de começar:**
```
STRIPE_SECRET_KEY           # Stripe billing — ADICIONAR
STRIPE_WEBHOOK_SECRET       # Stripe webhooks — ADICIONAR
SLACK_BOT_TOKEN             # Slack integration (tickets) — ADICIONAR
SLACK_CHANNEL_TICKETS       # Channel ID para tickets — ADICIONAR
SLACK_CHANNEL_ALERTS        # Channel ID para alertas técnicos — ADICIONAR
RESEND_API_KEY              # Transactional emails — ADICIONAR
SENTRY_DSN                  # Error tracking (opcional) — ADICIONAR
```

### 0.3 Estrutura de Domínios

```
faturai.com                → Landing page + marketing (pode ser mesmo Vercel project ou subpath)
app.faturai.com            → Aplicação SaaS (React app)
api.faturai.com            → Custom domain Supabase (opcional, nice-to-have)
```

### 0.4 Estrutura de Pastas do Projeto (Target)

```
/
├── PLAN.md                          # Este ficheiro
├── CLAUDE.md                        # Instruções para Claude Code (atualizar)
├── .claude/
│   └── agents/                      # Claude Code agents
├── package.json
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
│
├── src/
│   ├── main.tsx
│   ├── App.tsx                       # Router principal
│   ├── index.css                     # Tailwind + design tokens
│   │
│   ├── types/
│   │   ├── database.ts               # Types Supabase (auto-generated + manual)
│   │   ├── tenant.ts                  # Tenant, TenantSettings, Plan types
│   │   ├── billing.ts                 # Stripe types
│   │   └── tickets.ts                 # Ticket/feedback types
│   │
│   ├── lib/
│   │   ├── supabase/
│   │   │   └── client.ts             # Supabase client
│   │   ├── stripe/
│   │   │   └── client.ts             # Stripe.js loader
│   │   ├── ai/
│   │   │   ├── promptBuilder.ts       # Gera prompts dinâmicos por tenant
│   │   │   └── analyzer.ts            # Frontend → Edge Function
│   │   ├── integrations/
│   │   │   ├── google/
│   │   │   │   ├── drive.ts
│   │   │   │   ├── sheets.ts
│   │   │   │   └── gmail.ts
│   │   │   └── microsoft/            # FUTURO
│   │   │       ├── onedrive.ts
│   │   │       └── outlook.ts
│   │   ├── sync/
│   │   │   └── exportZip.ts
│   │   ├── utils/
│   │   │   ├── validation.ts
│   │   │   ├── suppliers.ts
│   │   │   ├── formatting.ts          # formatCurrency (multi-moeda), formatDate (multi-locale)
│   │   │   └── tenantUtils.ts
│   │   ├── errors/
│   │   │   ├── errorBoundary.tsx       # React error boundary
│   │   │   ├── errorReporter.ts        # Report to Sentry + Supabase log
│   │   │   └── errorTypes.ts
│   │   ├── rateLimiter.ts
│   │   ├── cn.ts
│   │   └── i18n.ts                    # Expandir: FR, PT, EN, ES
│   │
│   ├── contexts/
│   │   ├── AuthContext.tsx
│   │   ├── TenantContext.tsx           # NOVO: tenant atual, settings, plano
│   │   └── I18nContext.tsx
│   │
│   ├── hooks/
│   │   ├── useTenant.ts               # Hook para aceder ao tenant context
│   │   ├── useBilling.ts              # Hook para Stripe billing status
│   │   ├── useFeatureGate.ts           # Hook para verificar limites do plano
│   │   ├── useCompanyFilter.ts
│   │   ├── useUploadDeps.ts
│   │   ├── useUploadQueue.ts
│   │   ├── useBulkActions.ts
│   │   └── useIsMobile.ts
│   │
│   ├── components/
│   │   ├── ui/                        # Shadcn (manter)
│   │   ├── common/
│   │   │   ├── LoadingSpinner.tsx
│   │   │   ├── ErrorFallback.tsx       # NOVO
│   │   │   ├── FeatureGate.tsx         # NOVO: wrapper que bloqueia features por plano
│   │   │   └── PlanBadge.tsx           # NOVO
│   │   ├── layout/
│   │   │   ├── AppLayout.tsx
│   │   │   ├── Sidebar.tsx            # Adaptar ao tenant (logo, cores, nome)
│   │   │   ├── MobileHeader.tsx
│   │   │   └── CompanySelector.tsx
│   │   ├── landing/                   # NOVO: Landing page components
│   │   │   ├── Hero.tsx
│   │   │   ├── Features.tsx
│   │   │   ├── Pricing.tsx
│   │   │   ├── Testimonials.tsx
│   │   │   ├── FAQ.tsx
│   │   │   ├── CTA.tsx
│   │   │   └── Footer.tsx
│   │   ├── onboarding/               # NOVO: Questionário
│   │   │   ├── OnboardingWizard.tsx    # Stepper principal
│   │   │   ├── StepCompany.tsx         # Bloco 1: A Empresa
│   │   │   ├── StepInvoiceIntel.tsx    # Bloco 2: Inteligência de Faturas
│   │   │   ├── StepStorage.tsx         # Bloco 3: Organização e Storage
│   │   │   ├── StepDashboard.tsx       # Bloco 4: Dashboard
│   │   │   ├── StepAutomation.tsx      # Bloco 5: Automação e Email
│   │   │   ├── StepReview.tsx          # Resumo antes de submeter
│   │   │   ├── StepPayment.tsx         # Stripe Checkout
│   │   │   └── ProgressBar.tsx
│   │   ├── billing/                   # NOVO
│   │   │   ├── PlanSelector.tsx
│   │   │   ├── UsageMeter.tsx
│   │   │   ├── InvoiceHistory.tsx      # Faturas do Stripe (as nossas, não as do cliente)
│   │   │   └── UpgradePrompt.tsx
│   │   ├── tickets/                   # NOVO
│   │   │   ├── TicketList.tsx
│   │   │   ├── TicketDetail.tsx
│   │   │   ├── NewTicketForm.tsx
│   │   │   ├── FeedbackWidget.tsx      # Floating feedback button
│   │   │   └── StatusBadge.tsx
│   │   ├── dashboard/
│   │   ├── faturas/
│   │   ├── upload/
│   │   ├── inbox/
│   │   ├── fournisseurs/
│   │   ├── automations/
│   │   └── settings/
│   │
│   └── pages/
│       ├── Landing.tsx                # NOVO: Marketing page
│       ├── Onboarding.tsx             # NOVO: Questionário wizard
│       ├── Dashboard.tsx
│       ├── Inbox.tsx
│       ├── Faturas.tsx
│       ├── Upload.tsx
│       ├── Fournisseurs.tsx
│       ├── Automations.tsx
│       ├── Settings.tsx
│       ├── Billing.tsx                # NOVO
│       ├── Tickets.tsx                # NOVO
│       ├── Login.tsx
│       └── NotFound.tsx               # NOVO
│
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   │   ├── 001_multi_tenant_tables.sql    # Novas tabelas: tenants, plans, tenant_users, tickets, etc.
│   │   ├── 002_add_tenant_id.sql          # Adicionar tenant_id às tabelas existentes
│   │   ├── 003_rls_multi_tenant.sql       # RLS atualizado para multi-tenant
│   │   ├── 004_seed_plans.sql             # Seed dos 3 planos (Starter, Pro, Entreprise)
│   │   └── 005_error_logging.sql          # Tabela de error logs
│   └── functions/
│       ├── analyze-document/          # AI analysis (adaptar para multi-tenant)
│       ├── sync-email/                # Gmail sync (adaptar)
│       ├── oauth-callback/            # Google OAuth (adaptar)
│       ├── refresh-token/             # Token refresh (adaptar)
│       ├── stripe-webhook/            # NOVO: Stripe webhook handler
│       ├── provision-tenant/          # NOVO: Setup automático após onboarding
│       ├── slack-notify/              # NOVO: Enviar notificações ao Slack
│       ├── send-report/               # NOVO: Relatórios automáticos por email
│       ├── usage-tracker/             # NOVO: Contagem de faturas processadas/mês
│       └── cron-daily/                # NOVO: Cron job diário (sync emails de todos os tenants)
│
├── database/
│   ├── SCHEMA.sql                     # Schema completo (referência)
│   ├── RLS_POLICIES.sql               # Policies completas (referência)
│   └── SEED.sql                       # Seed data (planos, categorias default)
│
└── docs/
    ├── ARCHITECTURE.md                # Diagrama de arquitetura
    ├── API.md                         # Documentação de Edge Functions
    ├── MULTI_TENANT.md                # Guia de multi-tenancy
    └── RUNBOOK.md                     # Operações e troubleshooting
```

---

<a id="fase-1"></a>
## FASE 1 — Schema Multi-Tenant (Evolução do DB Existente) ✅

> **NOTA:** O Supabase project `wvopuqyotvwgronujvrb` já existe com as tabelas `companies`, `invoices`, `invoice_line_items`, `suppliers`, `categories`, `email_accounts`, `user_oauth_tokens`, `audit_log` e respectivos triggers. Vamos ADICIONAR novas tabelas e ALTERAR as existentes para suportar multi-tenancy. NÃO recriar do zero.

### 1.1 Tabela `tenants` (Nova — Core)

```sql
CREATE TABLE tenants (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  
  -- Identidade
  name TEXT NOT NULL,                          -- Nome legal
  slug TEXT NOT NULL UNIQUE,                   -- URL-safe identifier (auto-gerado)
  nif TEXT,                                    -- NIF/VAT number
  sector TEXT,                                 -- Setor/indústria
  country TEXT DEFAULT 'FR',                   -- País (ISO 3166-1 alpha-2)
  
  -- Branding
  logo_url TEXT,                               -- URL do logo (Supabase Storage)
  primary_color TEXT DEFAULT '#0E2435',         -- Cor primária
  secondary_color TEXT DEFAULT '#BBB388',       -- Cor secundária
  
  -- Billing
  stripe_customer_id TEXT UNIQUE,              -- Stripe Customer ID
  stripe_subscription_id TEXT,                 -- Stripe Subscription ID
  plan_id UUID REFERENCES plans(id),           -- Plano atual
  plan_status TEXT DEFAULT 'trialing' NOT NULL, -- trialing, active, past_due, canceled, paused, pending_contact (Entreprise)
  trial_ends_at TIMESTAMPTZ,                   -- Fim do trial (14 dias)
  
  -- Usage
  invoices_this_month INTEGER DEFAULT 0,        -- Contador mensal
  invoices_month_reset TIMESTAMPTZ,             -- Quando resetar o contador
  
  -- Onboarding
  onboarding_completed BOOLEAN DEFAULT false,
  onboarding_data JSONB,                        -- Respostas do questionário completas
  setup_status TEXT DEFAULT 'pending',          -- pending, provisioning, ready, error
  setup_error TEXT,
  
  -- AI Config (gerado do onboarding)
  ai_prompt_config JSONB,                       -- Categorias, fornecedores, regras específicas
  invoice_name_variations TEXT[],               -- Como o nome da empresa aparece nas faturas
  
  -- Settings
  currency TEXT DEFAULT 'EUR',
  date_format TEXT DEFAULT 'DD/MM/YYYY',
  language TEXT DEFAULT 'fr',                   -- Idioma default da UI
  timezone TEXT DEFAULT 'Europe/Paris',
  
  -- Storage config
  storage_provider TEXT DEFAULT 'google_drive',  -- google_drive, onedrive
  folder_structure TEXT DEFAULT 'year_type',     -- year_type, year_supplier, year_month
  auto_sheets BOOLEAN DEFAULT true,
  sheet_columns JSONB,                          -- Colunas customizadas do extrato
  
  -- Dashboard config
  dashboard_widgets JSONB,                      -- Widgets ativos e configuração
  auto_reports TEXT DEFAULT 'never',            -- never, weekly, monthly
  report_email TEXT,                            -- Email para receber reports
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  deleted_at TIMESTAMPTZ,
  
  -- Metadata
  referred_by TEXT,                             -- Referral tracking
  notes TEXT                                    -- Notas internas (admin)
);

CREATE INDEX idx_tenants_slug ON tenants(slug);
CREATE INDEX idx_tenants_stripe ON tenants(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
CREATE INDEX idx_tenants_active ON tenants(is_active) WHERE is_active = true;
```

### 1.2 Tabela `plans` (Nova)

```sql
CREATE TABLE plans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  
  name TEXT NOT NULL,                           -- Starter, Pro, Entreprise
  slug TEXT NOT NULL UNIQUE,                    -- starter, pro, entreprise
  
  -- Pricing
  price_monthly INTEGER,                        -- Em cêntimos (3900 = 39€). NULL = sur devis (Entreprise)
  price_yearly INTEGER,                         -- Em cêntimos (anual, com desconto). NULL = sur devis
  stripe_price_id_monthly TEXT,                 -- Stripe Price ID mensal. NULL para Entreprise
  stripe_price_id_yearly TEXT,                  -- Stripe Price ID anual. NULL para Entreprise
  setup_fee INTEGER DEFAULT 0,                  -- Taxa de setup em cêntimos (99-199€)
  stripe_setup_price_id TEXT,                   -- Stripe Price ID do setup fee
  is_custom_pricing BOOLEAN DEFAULT false,      -- true para Entreprise (preço definido por negociação)
  
  -- Limites
  max_invoices_month INTEGER,                   -- 100, 500, NULL (ilimitado para Entreprise)
  max_users INTEGER DEFAULT 1,                  -- 1, 1, ilimitado
  max_companies INTEGER DEFAULT 1,              -- 1, 3, ilimitado
  
  -- Features (flags)
  has_dashboard BOOLEAN DEFAULT true,
  has_drive_storage BOOLEAN DEFAULT true,
  has_manual_upload BOOLEAN DEFAULT true,
  has_email_sync BOOLEAN DEFAULT false,         -- Starter: não
  has_auto_sheets BOOLEAN DEFAULT false,         -- Starter: não
  has_reports BOOLEAN DEFAULT false,             -- Starter: não
  has_api_access BOOLEAN DEFAULT false,          -- Só Entreprise
  has_multi_user BOOLEAN DEFAULT false,          -- Só Entreprise
  has_priority_support BOOLEAN DEFAULT false,    -- Só Entreprise
  has_custom_branding BOOLEAN DEFAULT true,      -- Todos
  has_custom_domain BOOLEAN DEFAULT false,       -- Só Entreprise
  has_dedicated_account BOOLEAN DEFAULT false,   -- Só Entreprise (reunião pessoal + setup custom)
  
  -- Display
  description TEXT,
  features_list JSONB,                          -- Lista de features para a pricing page
  is_popular BOOLEAN DEFAULT false,             -- Badge "Popular"
  cta_label TEXT DEFAULT 'Commencer',           -- "Commencer", "Commencer", "Nous contacter"
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true
);

-- Seed dos 3 planos
INSERT INTO plans (name, slug, price_monthly, price_yearly, setup_fee, is_custom_pricing,
  max_invoices_month, max_users, max_companies,
  has_email_sync, has_auto_sheets, has_reports, has_api_access,
  has_multi_user, has_priority_support, has_custom_domain, has_dedicated_account,
  is_popular, cta_label, sort_order, description, features_list) VALUES

('Starter', 'starter', 3900, 39000, 9900, false,
  100, 1, 1,
  false, false, false, false,
  false, false, false, false,
  false, 'Commencer', 1,
  'Pour les petites entreprises qui veulent automatiser la gestion de factures.',
  '["Dashboard", "Google Drive", "Upload manuel", "Jusqu''à 100 factures/mois"]'::jsonb),

('Pro', 'pro', 7900, 79000, 14900, false,
  500, 1, 3,
  true, true, true, false,
  false, false, false, false,
  true, 'Commencer', 2,
  'Pour les entreprises en croissance avec besoin de synchronisation email et rapports.',
  '["Tout du Starter", "+ Sync email automatique", "+ Sheets/Excel auto", "+ Rapports automatiques", "Jusqu''à 500 factures/mois", "Jusqu''à 3 entreprises"]'::jsonb),

('Entreprise', 'entreprise', NULL, NULL, NULL, true,
  NULL, NULL, NULL,
  true, true, true, true,
  true, true, true, true,
  false, 'Nous contacter', 3,
  'Solution sur mesure avec domaine personnalisé, réunion dédiée et setup fully custom.',
  '["Tout du Pro", "+ Multi-utilisateurs illimité", "+ Accès API", "+ Support prioritaire", "+ Domaine personnalisé (votre-entreprise.com)", "+ Réunion de setup personnalisée", "+ Configuration sur mesure", "Factures illimitées", "Entreprises illimitées"]'::jsonb);
```

### 1.3 Tabela `tenant_users` (Nova — Relação User↔Tenant)

```sql
CREATE TABLE tenant_users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  role TEXT NOT NULL DEFAULT 'member',           -- owner, admin, member, readonly
  invited_by UUID REFERENCES auth.users(id),
  invited_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  
  is_active BOOLEAN DEFAULT true,
  
  UNIQUE(tenant_id, user_id)
);

CREATE INDEX idx_tenant_users_user ON tenant_users(user_id);
CREATE INDEX idx_tenant_users_tenant ON tenant_users(tenant_id);
```

### 1.4 Adicionar `tenant_id` a TODAS as Tabelas Existentes

**REGRA ABSOLUTA:** Toda tabela que contém dados de cliente recebe `tenant_id UUID NOT NULL REFERENCES tenants(id)`.

Tabelas a alterar:
- `companies` → adicionar `tenant_id`
- `invoices` → adicionar `tenant_id`
- `invoice_line_items` → herda via `invoices` (mas pode ter `tenant_id` direto para queries mais rápidas)
- `suppliers` → adicionar `tenant_id`
- `categories` → adicionar `tenant_id` (NULL = global/default template)
- `email_accounts` → adicionar `tenant_id`
- `user_oauth_tokens` → adicionar `tenant_id`
- `audit_log` → adicionar `tenant_id`

**Novas tabelas que também precisam de `tenant_id`:**
- `tickets`
- `ticket_messages`
- `error_logs`

### 1.5 Tabela `tickets` (Nova)

```sql
CREATE TABLE tickets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  
  -- Ticket data
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT DEFAULT 'general',              -- general, bug, feature, billing, integration
  priority TEXT DEFAULT 'medium',               -- low, medium, high, urgent
  status TEXT DEFAULT 'open',                   -- open, in_progress, waiting_customer, resolved, closed
  
  -- Resolution
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),   -- Admin que resolveu
  resolution_notes TEXT,
  
  -- Slack integration
  slack_thread_ts TEXT,                          -- Slack thread timestamp (para manter conversa)
  slack_channel_id TEXT,
  
  -- Metadata
  browser_info JSONB,                           -- User agent, screen size, etc.
  page_url TEXT,                                -- Página onde o ticket foi criado
  screenshot_url TEXT,                          -- Screenshot opcional
  
  -- Satisfaction
  satisfaction_score INTEGER,                   -- 1-5 depois de resolver
  satisfaction_comment TEXT
);

CREATE INDEX idx_tickets_tenant ON tickets(tenant_id);
CREATE INDEX idx_tickets_status ON tickets(status) WHERE status != 'closed';
CREATE INDEX idx_tickets_created ON tickets(created_at DESC);
```

### 1.6 Tabela `ticket_messages` (Nova)

```sql
CREATE TABLE ticket_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),        -- NULL = system/bot message
  
  content TEXT NOT NULL,
  is_internal BOOLEAN DEFAULT false,              -- Nota interna (não visível ao cliente)
  is_from_admin BOOLEAN DEFAULT false,            -- Resposta de admin
  
  -- Attachments
  attachments JSONB                               -- Array de { name, url, size, type }
);

CREATE INDEX idx_ticket_messages_ticket ON ticket_messages(ticket_id);
```

### 1.7 Tabela `error_logs` (Nova — Observability)

```sql
CREATE TABLE error_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  
  tenant_id UUID REFERENCES tenants(id),          -- NULL = erro de sistema global
  user_id UUID REFERENCES auth.users(id),
  
  -- Error details
  level TEXT NOT NULL DEFAULT 'error',            -- debug, info, warn, error, fatal
  source TEXT NOT NULL,                           -- frontend, edge_function, cron, webhook
  function_name TEXT,                             -- Nome da Edge Function ou componente
  
  message TEXT NOT NULL,
  stack_trace TEXT,
  
  -- Context
  request_id TEXT,                                -- ID único do request
  http_method TEXT,
  http_path TEXT,
  http_status INTEGER,
  
  -- Extra data
  metadata JSONB,                                 -- Qualquer contexto adicional
  
  -- Resolution
  resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT                                -- Admin que resolveu
);

CREATE INDEX idx_error_logs_tenant ON error_logs(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX idx_error_logs_level ON error_logs(level) WHERE level IN ('error', 'fatal');
CREATE INDEX idx_error_logs_created ON error_logs(created_at DESC);
CREATE INDEX idx_error_logs_unresolved ON error_logs(resolved) WHERE resolved = false;

-- Auto-cleanup: manter 90 dias
-- (implementar via cron ou pg_cron)
```

### 1.8 Tabela `onboarding_submissions` (Nova)

```sql
CREATE TABLE onboarding_submissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  
  -- Pode não ter tenant ainda (criado durante o onboarding)
  tenant_id UUID REFERENCES tenants(id),
  user_id UUID REFERENCES auth.users(id),
  email TEXT NOT NULL,
  
  -- Status do onboarding
  status TEXT DEFAULT 'draft',                    -- draft, submitted, processing, completed, failed
  current_step INTEGER DEFAULT 1,                 -- 1-7 (steps do wizard)
  
  -- Respostas por bloco (JSONB para flexibilidade)
  block_company JSONB,                            -- Bloco 1: A Empresa
  block_invoice_intel JSONB,                      -- Bloco 2: Inteligência de Faturas
  block_storage JSONB,                            -- Bloco 3: Organização
  block_dashboard JSONB,                          -- Bloco 4: Dashboard
  block_automation JSONB,                         -- Bloco 5: Automação
  
  -- Ficheiros de exemplo
  sample_invoices TEXT[],                         -- URLs dos PDFs de exemplo uploadados
  logo_url TEXT,
  
  -- Selected plan
  selected_plan TEXT,                             -- starter, pro, entreprise
  billing_cycle TEXT DEFAULT 'monthly',           -- monthly, yearly
  
  -- Processing
  provisioning_started_at TIMESTAMPTZ,
  provisioning_completed_at TIMESTAMPTZ,
  provisioning_error TEXT,
  
  -- Stripe
  stripe_checkout_session_id TEXT,
  payment_completed BOOLEAN DEFAULT false
);
```

---

<a id="fase-2"></a>
## FASE 2 — Auth, Roles e Tenant Isolation ✅

### 2.1 Fluxo de Auth Atualizado

```
STARTER / PRO (self-service):
1. User chega à landing page
2. Clica "Commencer" → vai para /onboarding
3. Cria conta (email/password via Supabase Auth) no step 1
4. Preenche questionário (steps 2-6)
5. Escolhe plano Starter ou Pro + pagamento Stripe (step 7)
6. Edge Function `provision-tenant` cria tudo automaticamente
7. Redirect para /dashboard com tenant configurado

ENTREPRISE (com reunião pessoal):
1. User chega à landing page
2. Clica "Nous contacter" no plano Entreprise → vai para /onboarding
3. Cria conta + preenche questionário (steps 1-6)
4. No step 7, seleciona Entreprise → formulário de contacto
5. Slack recebe lead → nós agendamos reunião pessoal
6. Após reunião: setup custom no admin panel
7. Tenant criado manualmente com configuração à medida + domínio custom
8. Cliente recebe email com credenciais e link do seu domínio
```

### 2.2 TenantContext (React)

```typescript
// src/contexts/TenantContext.tsx
interface TenantContextType {
  tenant: Tenant | null;
  tenantSettings: TenantSettings | null;
  plan: Plan | null;
  role: 'owner' | 'admin' | 'member' | 'readonly';
  loading: boolean;
  
  // Usage
  invoicesUsed: number;
  invoicesLimit: number;
  isOverLimit: boolean;
  
  // Feature gates
  canUseEmailSync: boolean;
  canUseAutoSheets: boolean;
  canUseReports: boolean;
  canUseAPI: boolean;
  canInviteUsers: boolean;
  
  // Actions
  refreshTenant: () => Promise<void>;
}
```

### 2.3 RLS Pattern (TODAS as tabelas)

```sql
-- Pattern base para todas as tabelas com tenant_id
-- Usa helper function para evitar repetição e recursion

CREATE OR REPLACE FUNCTION get_user_tenant_ids()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT tenant_id FROM tenant_users
  WHERE user_id = (select auth.uid())
  AND is_active = true
$$;

-- Exemplo para invoices:
CREATE POLICY "Tenant isolation" ON invoices
  FOR ALL TO authenticated
  USING (tenant_id IN (SELECT get_user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids()));

-- Service role bypass (para Edge Functions)
CREATE POLICY "Service role bypass" ON invoices
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
```

**APLICAR ESTE PATTERN A:**
- `tenants` (só ver o próprio)
- `companies`
- `invoices`
- `invoice_line_items`
- `suppliers`
- `categories`
- `email_accounts`
- `user_oauth_tokens`
- `audit_log`
- `tickets`
- `ticket_messages`

### 2.4 Middleware de Tenant no Frontend

```typescript
// Em cada página/componente que carrega dados:
// 1. Verificar se user tem tenant ativo
// 2. Se não, redirect para /onboarding
// 3. Se plano expirado, redirect para /billing
// 4. Se setup não completo, redirect para /onboarding/status
```

---

<a id="fase-3"></a>
## FASE 3 — Onboarding Questionnaire (20 Perguntas) ✅

### 3.1 Wizard UX

- **7 steps** (5 blocos + revisão + pagamento)
- Progress bar animada no topo
- Auto-save a cada step (para `onboarding_submissions`)
- Pode fechar e retomar depois
- Mobile-friendly (cada pergunta ocupa o ecrã inteiro em mobile)
- Validação inline (não no submit)
- Animações suaves entre steps (framer-motion ou CSS)

### 3.2 Bloco 1: A Empresa (Step 1)

| # | Campo | Tipo | Validação | Obrigatório |
|---|-------|------|-----------|-------------|
| 1 | Nome legal da empresa | text | min 2 chars | Sim |
| 2 | NIF/VAT da empresa | text | Formato válido por país (regex) | Sim |
| 3 | País | select (EU countries) | — | Sim |
| 4 | Setor/Indústria | select + "Outro" com text | — | Sim |
| 5 | Logo da empresa | file upload (PNG/SVG/JPG, max 2MB) | Dimensões mínimas 200x200 | Não |
| 6 | Cores da marca | color picker (primária + secundária) OU "extrair do logo" | Hex válido | Não (defaults se vazio) |

**Setores pré-definidos:**
- Construction / BTP
- Commerce / Retail
- Services / Consulting
- Restauration / Hôtellerie
- Transport / Logistique
- Santé / Médical
- Technologie / IT
- Immobilier
- Agriculture
- Autre (campo livre)

### 3.3 Bloco 2: Inteligência de Faturas (Step 2)

| # | Campo | Tipo | Para quê |
|---|-------|------|----------|
| 7 | Nome da empresa como aparece nas faturas | text[] (adicionar variações) | AI ignora faturas emitidas POR eles |
| 8 | Nº médio de faturas/mês | range slider (10-50-100-200-500-1000+) | Dimensionar plano + sugerir upgrade |
| 9 | Categorias de custos | multi-select com templates por setor + custom | Gerar categorias no prompt AI |
| 10 | Top fornecedores (5-10) | tag input (adicionar nomes) | Normalizar nomes no prompt AI |
| 11 | Tipos de documento | checkboxes (factures, reçus, avoirs, devis) | Configurar validação |
| 12 | Upload de 3-5 faturas exemplo | file upload multi (PDF/JPG/PNG) | Calibração do AI |

**Templates de categorias por setor:**

```typescript
const CATEGORY_TEMPLATES = {
  'construction': {
    metiers: ['Électricité', 'Plomberie', 'Chauffage', 'Plâtrerie', 'Maçonnerie', 'Peinture', 'Menuiserie'],
    natures: ['Matériaux', 'Sous-traitants', 'Location matériel', 'Carburant', 'Restauration', 'Assurances'],
    cost_types: ['Coûts fixes', 'Coûts variables'],
  },
  'commerce': {
    metiers: [],
    natures: ['Marchandises', 'Emballage', 'Transport', 'Marketing', 'Loyer', 'Assurances'],
    cost_types: ['Coûts fixes', 'Coûts variables'],
  },
  'services': {
    metiers: [],
    natures: ['Sous-traitance', 'Logiciels/SaaS', 'Déplacements', 'Formation', 'Loyer', 'Assurances'],
    cost_types: ['Coûts fixes', 'Coûts variables'],
  },
  // ... mais setores
};
```

### 3.4 Bloco 3: Organização e Storage (Step 3)

| # | Campo | Tipo | Para quê |
|---|-------|------|----------|
| 13 | Storage provider | radio (Google Drive / OneDrive) | Integrar a API correta |
| 14 | Estrutura de pastas | visual picker (3 templates) | Gerar a lógica de pastas |
| 15 | Extrato automático em Sheets/Excel? | toggle | Ativar sync |
| 16 | Colunas do extrato | checkbox list (template base + drag-to-reorder) | Configurar o append |

**Templates de pastas:**
```
Template A: Ano > Tipo Custo
  FACTURES/2026/Coûts fixes/...
  FACTURES/2026/Coûts variables/...

Template B: Ano > Mês
  FACTURES/2026/01 - Janvier/...
  FACTURES/2026/02 - Février/...

Template C: Ano > Mês > Métier (como o LGM atual)
  FACTURES/2026/01 - Janvier/Électricité/...
```

### 3.5 Bloco 4: Dashboard (Step 4)

| # | Campo | Tipo | Para quê |
|---|-------|------|----------|
| 17 | Widgets do dashboard | checkbox list com preview | Configurar widgets |
| 18 | Moeda principal | select (EUR, USD, GBP, CHF) | Formatação |
| 19 | Relatórios automáticos | radio (nunca / semanal / mensal) | Agendar reports |

### 3.6 Bloco 5: Automação e Email (Step 5)

| # | Campo | Tipo | Para quê |
|---|-------|------|----------|
| 20 | Importação automática de email? | toggle + provider selector | Integrar Gmail/Outlook |
| 21 | Email(s) onde recebe faturas | email input (adicionar múltiplos) | Configurar sync |

**Nota:** Gmail sync requer Google OAuth verification. Até lá, usar upload manual como default e email sync como feature "coming soon" ou via consentimento individual.

### 3.7 Step 6: Revisão

- Mostrar resumo de todas as respostas
- Permitir editar qualquer campo (voltar ao step)
- Mostrar plano recomendado baseado nas respostas
- CTA: "Confirmar e escolher plano"

### 3.8 Step 7: Pagamento (Stripe) / Contacto (Entreprise)

- Mostrar os 3 planos lado a lado
- Plano recomendado pre-selecionado (baseado no nº de faturas/mês)
- Toggle mensal/anual para Starter e Pro (desconto anual visível)
- Setup fee apresentado separadamente
- **Starter / Pro:** Stripe Checkout (redirect ou embedded). Trial de 14 dias.
- **Entreprise:** CTA "Nous contacter" → formulário de agendamento de reunião (Calendly embed ou form custom com: nome, email, telefone, disponibilidade, notas). O onboarding fica em estado "pending_contact" e nós recebemos notificação no Slack. Reunião pessoal para definir scope, preço, e configuração custom. Setup feito manualmente ou via admin panel.

**Entreprise landing no Slack:**
```
🏢 *Nouveau lead Entreprise*
*Entreprise:* {nome da empresa}
*Secteur:* {setor}
*Contact:* {email} | {telefone}
*Faturas/mois:* {estimativa}
*Disponibilité:* {slots escolhidos}
---
_{notas do cliente}_
<https://admin.faturai.com/onboarding/UUID|Ver onboarding completo>
```

---

<a id="fase-4"></a>
## FASE 4 — Landing Page + Marketing Site ✅

### 4.1 Secções da Landing Page

1. **Hero** — Headline forte, sub-headline, CTA "Começar grátis", screenshot/demo
2. **Social Proof** — "Confiado por X empresas" (mesmo que poucos no início)
3. **How It Works** — 3 steps: Responda → Configuramos → Automatize
4. **Features Grid** — 6-8 features com ícones
5. **Pricing** — 3 planos: Starter (39€), Pro (79€, badge "Populaire"), Entreprise (sur devis — "Nous contacter")
6. **Testimonials** — Quotes de clientes (inicialmente LGM)
7. **FAQ** — 8-10 perguntas frequentes
8. **CTA Final** — "Comece em 5 minutos" + formulário de email
9. **Footer** — Links, legal, social

### 4.2 Design Direction

- **Tom:** Profissional mas acessível. Não enterprise-pesado, não startup-brincalhão.
- **Cores:** Usar as do FaturaAI (navy #0E2435 + gold #BBB388)
- **Tipografia:** Inter (já em uso)
- **Ilustrações:** Ícones Lucide + ilustrações simples (não fotos stock genéricas)
- **Animações:** Scroll-reveal suave, não exagerado
- **Idiomas:** FR por default, toggle PT/EN no header

### 4.3 SEO & Meta

```html
<title>FaturaAI — Gestion intelligente de factures par IA</title>
<meta name="description" content="Automatisez la gestion de vos factures fournisseurs. IA, Google Drive, rapports automatiques. Setup en 5 minutes." />
```

### 4.4 Páginas Adicionais (Futuro)

- `/pricing` — Pricing page dedicada
- `/about` — Sobre nós
- `/legal/terms` — Termos de serviço
- `/legal/privacy` — Política de privacidade
- `/legal/gdpr` — Conformidade GDPR
- `/blog` — Blog (SEO, content marketing) — FUTURO

---

<a id="fase-5"></a>
## FASE 5 — Stripe Integration + Billing ✅

### 5.1 Produtos Stripe a Criar

```
Produto: FaturaAI Starter
  - Price mensal: 39€/mês (3900 cêntimos)
  - Price anual: 390€/ano (32.50€/mês equivalente)

Produto: FaturaAI Pro
  - Price mensal: 79€/mês
  - Price anual: 790€/ano

Produto: FaturaAI Entreprise
  - SEM preço fixo no Stripe
  - Preço definido por negociação/reunião pessoal
  - Criar Stripe Invoice manual após acordo
  - Setup fee custom (incluído na proposta)

Produto: Setup Fee
  - Price one-time: 99€ (Starter), 149€ (Pro)
  - Entreprise: incluído na proposta custom
```

**NOTA sobre Entreprise:** O plano Entreprise NÃO passa pelo Stripe Checkout automático. O fluxo é:
1. Cliente preenche onboarding e seleciona "Entreprise"
2. Em vez de ir para Stripe, vai para um formulário de contacto / agendamento de reunião
3. Nós fazemos reunião pessoal, definimos preço e scope
4. Nós criamos o tenant manualmente (ou via admin panel) com configuração custom
5. Stripe Invoice manual enviado ao cliente

### 5.2 Fluxo Stripe (Starter & Pro)

```
1. User completa onboarding → Step 7 (pagamento)
2. Se plano = Entreprise:
   a. Mostrar formulário de contacto (não Stripe)
   b. Guardar onboarding_submissions com status = 'pending_contact'
   c. Notificar Slack (#faturai-alerts) com lead Entreprise
   d. Redirect para página "Merci! Nous vous contacterons sous 24h."
   e. STOP — setup manual após reunião
3. Se plano = Starter ou Pro:
   a. Frontend cria Checkout Session via Edge Function
   b. Edge Function:
      i.  Cria Stripe Customer (se não existe)
      ii. Cria Checkout Session com:
          - Subscription (plano escolhido)
          - One-time charge (setup fee: 99€ Starter, 149€ Pro)
          - Trial period (14 dias)
          - Success URL: /onboarding/success?session_id={CHECKOUT_SESSION_ID}
          - Cancel URL: /onboarding/payment
      iii. Retorna session URL
   c. Frontend redireciona para Stripe Checkout
4. Após pagamento:
   a. Stripe envia webhook `checkout.session.completed`
   b. Edge Function `stripe-webhook`:
      - Atualiza tenant (stripe_customer_id, stripe_subscription_id, plan_status)
      - Marca onboarding_submissions como paid
      - Trigger `provision-tenant` (setup automático)
   c. User é redirecionado para /onboarding/success
   d. Página mostra "Configuration de votre plateforme..." com progress
```

### 5.3 Edge Function: `stripe-webhook`

Eventos a processar:
- `checkout.session.completed` → Ativar tenant, iniciar provisioning
- `invoice.paid` → Renovação OK
- `invoice.payment_failed` → Marcar past_due, notificar user
- `customer.subscription.updated` → Upgrade/downgrade de plano
- `customer.subscription.deleted` → Cancelamento
- `customer.subscription.trial_will_end` → Aviso 3 dias antes do fim do trial

### 5.4 Billing Page (para o cliente)

- Plano atual + uso (X/Y faturas este mês, ou "Illimité" para Entreprise)
- Próxima fatura Stripe (Starter/Pro) ou "Facturation personnalisée" (Entreprise)
- Histórico de faturas (Stripe Customer Portal link)
- Botão "Upgrade" (Starter→Pro: self-service, qualquer→Entreprise: "Nous contacter")
- Botão "Downgrade" (Pro→Starter: self-service com aviso de perda de features)
- Botão "Annuler" (com confirmation dialog + retention offer)

### 5.5 Feature Gating

```typescript
// src/components/common/FeatureGate.tsx
function FeatureGate({ feature, children, fallback }: {
  feature: keyof Plan;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const { plan } = useTenant();
  if (!plan || !plan[feature]) {
    return fallback ?? <UpgradePrompt feature={feature} />;
  }
  return children;
}

// Uso:
<FeatureGate feature="has_email_sync">
  <EmailSyncSettings />
</FeatureGate>
```

### 5.6 Usage Enforcement

```typescript
// Antes de processar cada fatura:
async function checkUsageLimit(tenantId: string): Promise<{ allowed: boolean; remaining: number }> {
  const { data: tenant } = await supabase
    .from('tenants')
    .select('invoices_this_month, plans!inner(max_invoices_month, is_custom_pricing)')
    .eq('id', tenantId)
    .single();
  
  // Entreprise (custom pricing) = sem limite
  if (tenant.plans.is_custom_pricing || tenant.plans.max_invoices_month === null) {
    return { allowed: true, remaining: Infinity };
  }
  
  const used = tenant.invoices_this_month;
  const limit = tenant.plans.max_invoices_month;
  
  return { allowed: used < limit, remaining: limit - used };
}
```

---

<a id="fase-6"></a>
## FASE 6 — AI Engine: Tenant-Aware Prompt System

### 6.1 Prompt Builder Dinâmico

O prompt AI atual é hardcoded para LGM (construção civil francesa). Precisa de ser gerado dinamicamente baseado na configuração do tenant.

```typescript
// src/lib/ai/promptBuilder.ts
export function buildTenantPrompt(config: TenantAIConfig): string {
  return `
# RÔLE
Tu es un COMPTABLE SENIOR spécialisé dans le secteur ${config.sector}.

# OBJECTIF
Traiter des images/PDFs de factures pour l'entreprise "${config.companyName}".
Le NIF/VAT de l'entreprise est: ${config.nif}.
L'entreprise apparaît sur les factures comme: ${config.nameVariations.join(', ')}.

# VALIDATION INITIALE
[... mesmo que atual ...]

# RÈGLES DE CLASSIFICATION

## Type de coût:
${config.costTypes.map(ct => `- "${ct.code}": ${ct.description}`).join('\n')}

## Catégories de dépenses:
${config.categories.map(cat => `- "${cat.code}": ${cat.label}`).join('\n')}

${config.metiers?.length ? `## Métiers/Spécialités:
${config.metiers.map(m => `- "${m.code}": ${m.label}`).join('\n')}` : ''}

## Fournisseurs connus (normalisation):
${config.knownSuppliers.map(s => `- "${s.variations.join('" ou "')}" → "${s.normalized}"`).join('\n')}

# EXTRACTION DE DONNÉES
[... adaptado ao país/moeda do tenant ...]
- Moeda: ${config.currency}
- Format dates: ${config.dateFormat}
- TVA/IVA rates: ${config.vatRates.join(', ')}%

[... resto do prompt ...]
  `;
}
```

### 6.2 AI Config Gerada no Onboarding

A Edge Function `provision-tenant` gera o `ai_prompt_config` JSONB a partir das respostas do questionário:

```json
{
  "companyName": "LGM",
  "nif": "FR12345678901",
  "sector": "construction",
  "nameVariations": ["LGM", "SARL LGM", "LGM BTP"],
  "currency": "EUR",
  "dateFormat": "DD/MM/YYYY",
  "vatRates": [20, 10, 5.5, 0],
  "costTypes": [
    { "code": "cout_fixe", "label": "Coûts fixes", "description": "Loyers, assurances..." },
    { "code": "cout_variable", "label": "Coûts variables", "description": "Matériaux, sous-traitance..." }
  ],
  "categories": [...],
  "metiers": [...],
  "knownSuppliers": [
    { "normalized": "LEROY MERLIN", "variations": ["Leroy Merlin", "LEROY MERLIN SAS"] }
  ]
}
```

### 6.3 Calibração com Faturas de Exemplo

As 3-5 faturas de exemplo uploadadas no onboarding são processadas automaticamente durante o provisioning:
1. Analisar cada fatura com o prompt genérico
2. Usar os resultados para refinar o prompt (detectar padrões, fornecedores recorrentes)
3. Guardar as faturas como "exemplos" no tenant (não contam para o limite mensal)

---

<a id="fase-7"></a>
## FASE 7 — Integrations Hub

### 7.1 Google Drive (Manter e Adaptar)

- Já funcional no projeto atual
- Adaptar para usar `tenant_id` em todas as operações
- Cada tenant tem a sua pasta raiz própria (não partilhada)
- Configuração de estrutura de pastas vem do `tenant.folder_structure`

### 7.2 Google Sheets (Manter e Adaptar)

- Já funcional
- Adaptar colunas do extrato baseado no `tenant.sheet_columns`
- Feature-gated: só Pro e Entreprise

### 7.3 Gmail Sync (Manter e Adaptar)

- Já funcional
- **BLOQUEIO:** Google OAuth verification (necesário para publicar)
- Solução temporária: cada tenant faz OAuth individual (consent screen em "testing mode")
- Feature-gated: só Pro e Entreprise
- Cron `cron-daily` itera sobre TODOS os tenants com email sync ativo

### 7.4 Microsoft OneDrive/Outlook (FUTURO — Fase 2 do SaaS)

- Usar Microsoft Graph API
- OneDrive para storage (alternativa ao Google Drive)
- Outlook para email sync (alternativa ao Gmail)
- **NÃO implementar agora** — marcar como "Coming soon" no onboarding

---

<a id="fase-8"></a>
## FASE 8 — Dashboard Multi-Tenant

### 8.1 Adaptar Dashboard Existente

- Todas as queries filtram por `tenant_id` (via RLS)
- Widgets configuráveis baseado no `tenant.dashboard_widgets`
- Moeda formatada com `tenant.currency`
- Datas formatadas com `tenant.date_format`
- Categorias e labels vêm do `tenant.ai_prompt_config.categories`

### 8.2 Relatórios Automáticos

Edge Function `send-report`:
- Cron: domingos à noite (semanal) ou dia 1 do mês (mensal)
- Gera PDF/HTML com métricas do período
- Envia por email (Resend API) para `tenant.report_email`
- Feature-gated: só Pro e Entreprise

---

<a id="fase-9"></a>
## FASE 9 — Ticket System + Feedback + Slack Integration

### 9.1 Ticket System (Cliente)

**Acesso:** Página `/tickets` + floating widget (canto inferior direito)

**Criar ticket:**
- Subject + Description (rich text básico)
- Categoria (dropdown)
- Prioridade (auto-detectada ou manual)
- Screenshot (botão para capturar)
- Anexos (drag & drop)

**Ver tickets:**
- Lista com filtros (status, categoria)
- Detalhe com thread de mensagens
- Status badge (open, in_progress, resolved)
- Satisfação (1-5 stars após resolução)

### 9.2 Feedback Widget

- Botão flutuante "?" ou "Feedback" no canto inferior direito
- Quick feedback: emoji (😊😐😞) + texto opcional
- "Report a bug" → abre form de ticket com contexto auto-preenchido
- "Feature request" → abre form simplificado
- Guarda automaticamente: página atual, browser info, tenant info

### 9.3 Slack Integration

**Setup:**
1. Criar Slack App ("FaturaAI Tickets")
2. Bot token com permissões: `chat:write`, `chat:update`, `reactions:read`
3. Canal dedicado: `#faturai-tickets`
4. Canal de alertas técnicos: `#faturai-alerts`

**Fluxo:**
```
1. Cliente cria ticket
2. Edge Function `slack-notify`:
   a. Posta mensagem no #faturai-tickets com:
      - Tenant name, plano, ticket subject
      - Link para admin panel
      - Botões: "Assign to me", "Mark resolved"
   b. Guarda `slack_thread_ts` no ticket
3. Respostas no admin panel → postam no thread Slack
4. Reações/respostas no Slack → Edge Function atualiza ticket
   (via Slack Events API ou polling — decidir)
5. Quando resolvido → emoji ✅ no Slack thread
```

**Mensagem Slack template:**
```
🎫 *Novo Ticket* — [Tenant: LGM | Plan: Pro]
*Subject:* Faturas duplicadas no dashboard
*Category:* Bug | *Priority:* High
*User:* secretaria@lgm.fr
---
_{description truncada}_
<https://admin.faturai.com/tickets/UUID|Ver no Admin> | <https://app.faturai.com/tickets/UUID|Ver no App>
```

### 9.4 Alertas no Slack (Automáticos)

Canal `#faturai-alerts` recebe:
- Novos signups (tenant criado)
- Pagamentos falhados (Stripe)
- Erros críticos (Edge Functions)
- Usage warnings (tenant a 80% do limite)
- Trial ending (3 dias antes)

---

<a id="fase-10"></a>
## FASE 10 — Error Logging & Observability

### 10.1 Stack de Observability

1. **Frontend errors** → React Error Boundary + `errorReporter.ts`
2. **Edge Function errors** → try/catch wrapper + `error_logs` table + Slack alert
3. **Supabase DB errors** → Logged automaticamente
4. **External API errors** (Google, Stripe, OpenRouter) → Retry + log
5. **Sentry** (opcional) → Para stack traces detalhados

### 10.2 Error Reporter (Frontend)

```typescript
// src/lib/errors/errorReporter.ts
export async function reportError(error: Error, context?: ErrorContext) {
  // 1. Log to console (dev)
  console.error('[FaturaAI Error]', error, context);
  
  // 2. Log to Supabase error_logs
  try {
    await supabase.from('error_logs').insert({
      tenant_id: context?.tenantId,
      user_id: context?.userId,
      level: context?.level || 'error',
      source: 'frontend',
      function_name: context?.component || context?.function,
      message: error.message,
      stack_trace: error.stack,
      metadata: {
        url: window.location.href,
        userAgent: navigator.userAgent,
        ...context?.extra,
      },
    });
  } catch { /* silently fail — don't error on error reporting */ }
  
  // 3. Sentry (se configurado)
  if (window.Sentry) {
    window.Sentry.captureException(error, { extra: context });
  }
}
```

### 10.3 Edge Function Error Wrapper

```typescript
// Wrapper para TODAS as Edge Functions
function withErrorHandling(handler: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    const requestId = crypto.randomUUID();
    const startTime = Date.now();
    
    try {
      const response = await handler(req);
      
      // Log slow requests
      const duration = Date.now() - startTime;
      if (duration > 10000) {
        await logToDb({
          level: 'warn',
          source: 'edge_function',
          message: `Slow request: ${duration}ms`,
          request_id: requestId,
          http_method: req.method,
          http_path: new URL(req.url).pathname,
        });
      }
      
      return response;
    } catch (error) {
      await logToDb({
        level: 'error',
        source: 'edge_function',
        function_name: handler.name,
        message: error.message,
        stack_trace: error.stack,
        request_id: requestId,
        http_method: req.method,
        http_path: new URL(req.url).pathname,
      });
      
      // Slack alert for critical errors
      if (isCritical(error)) {
        await notifySlack(`🚨 Critical error in ${handler.name}: ${error.message}`);
      }
      
      return new Response(
        JSON.stringify({ error: 'Internal error', request_id: requestId }),
        { status: 500 }
      );
    }
  };
}
```

### 10.4 Dashboard de Erros (Admin Panel)

- Lista de erros recentes (últimas 24h, 7d, 30d)
- Filtrar por: tenant, level, source, resolved/unresolved
- Agrupar erros similares
- Marcar como resolvido
- Ver tendências (gráfico de erros por dia)

---

<a id="fase-11"></a>
## FASE 11 — Admin Panel (Nosso Backoffice)

### 11.1 Acesso

- URL: `admin.faturai.com` OU `/admin` (protected route)
- Auth: mesma auth Supabase, mas com check `role = 'superadmin'` na tabela `user_roles_global`
- **NUNCA acessível por clientes normais**

### 11.2 Features do Admin

1. **Tenants** — Lista, detalhes, editar, pausar/reativar, impersonar
2. **Billing** — Overview receita, MRR, churn, faturas pendentes
3. **Tickets** — Ver todos, responder, atribuir, resolver
4. **Errors** — Dashboard de erros (fase 10.4)
5. **Usage** — Métricas de uso por tenant
6. **Onboarding** — Ver submissions pendentes, status de provisioning
7. **System** — Health checks, Edge Function logs, cron status

### 11.3 Impersonation

- Admin pode "ver como" qualquer tenant
- Adiciona header `X-Impersonate-Tenant: {tenant_id}` ou query param
- **CRÍTICO:** Nunca permitir ações destrutivas em modo impersonation
- Log de todas as impersonations na audit_log

---

<a id="fase-12"></a>
## FASE 12 — Testing, Security Audit, Launch Prep

### 12.1 Testing Checklist

- [ ] **Multi-tenant isolation:** Criar 2 tenants, verificar que dados NÃO leakam entre eles
- [ ] **RLS completo:** Para cada tabela, testar SELECT/INSERT/UPDATE/DELETE com user de tenant A não vê dados de tenant B
- [ ] **Stripe flows:** Checkout completo, webhook processing, upgrade, downgrade, cancelamento, payment failure
- [ ] **Onboarding end-to-end:** Criar conta → questionário → pagamento → provisioning → dashboard funcional
- [ ] **Feature gating:** Starter não vê email sync, Pro não vê API access, etc.
- [ ] **Usage limits:** Atingir limite de faturas → upload bloqueado com mensagem clara
- [ ] **Error handling:** Simular falhas de API (Google, Stripe, OpenRouter) → erros logados, user vê mensagem útil
- [ ] **Ticket system:** Criar ticket → aparece no Slack → responder no admin → user vê resposta
- [ ] **Mobile:** Todo o flow funciona em mobile (onboarding, upload, dashboard)
- [ ] **i18n:** Mudar idioma → toda a UI muda (FR, PT, EN)

### 12.2 Security Audit Checklist

- [ ] **Nenhuma API key no frontend** (apenas VITE_* públicas)
- [ ] **RLS ativo em TODAS as tabelas**
- [ ] **Edge Functions verificam JWT** do caller
- [ ] **CORS restrito** (apenas domínios autorizados)
- [ ] **Stripe webhook verifica assinatura**
- [ ] **OAuth state parameter assinado** (prevenir CSRF)
- [ ] **Rate limiting** em todas as Edge Functions
- [ ] **Input validation** em todos os endpoints
- [ ] **Soft delete** em todo o lado (nunca DELETE real)
- [ ] **Audit log** para todas as alterações em dados críticos
- [ ] **Secrets rotação** documentada e testada

### 12.3 Launch Prep

- [ ] Custom domain configurado (app.faturai.com)
- [ ] SSL certificado válido
- [ ] Error tracking ativo (Sentry ou equivalente)
- [ ] Slack channels criados e webhooks configurados
- [ ] Stripe produtos e preços criados em modo live
- [ ] Google OAuth consent screen publicado (ou em testing mode com nota)
- [ ] Termos de serviço e política de privacidade publicados
- [ ] GDPR compliance verificado (DPA com Supabase, Stripe, etc.)
- [ ] Backup strategy definida (Supabase faz backups automáticos em Pro)
- [ ] Runbook de operações criado (como resolver problemas comuns)

---

<a id="convencoes"></a>
## CONVENÇÕES DE CÓDIGO

### Regras Gerais

1. **TypeScript strict, zero erros no build.** `npm run build` antes de qualquer merge.
2. **Componentes max 150 linhas.** Se exceder, split.
3. **Separar UI de lógica.** Hooks para lógica, componentes para render.
4. **TanStack React Query** para todo o data fetching. Zero `useEffect` + `fetch` raw.
5. **Tailwind + Shadcn/UI** para toda a UI. Zero CSS custom fora do `index.css`.
6. **i18n**: Todo o texto user-facing via `t('key')`. Zero strings hardcoded.
7. **Error handling**: Todo o `async` tem `try/catch`. Todo o erro é reportado.
8. **Tenant isolation**: Toda a query, toda a mutation, toda a Edge Function filtra por `tenant_id`.

### Naming

- Ficheiros: `PascalCase.tsx` para componentes, `camelCase.ts` para utils/hooks
- Variáveis: `camelCase`
- Types/Interfaces: `PascalCase`
- DB columns: `snake_case`
- Edge Functions: `kebab-case` (pasta)
- Branches: `feat/XXXX-descricao`, `fix/XXXX-descricao`

### Imports

```typescript
// 1. React
import { useState, useEffect } from 'react';
// 2. Externos
import { useQuery } from '@tanstack/react-query';
// 3. Internos (absolutos)
import { supabase } from '@/lib/supabase/client';
import { useTenant } from '@/hooks/useTenant';
// 4. Types
import type { Invoice, Tenant } from '@/types/database';
// 5. Relativos (só para ficheiros na mesma pasta)
import { SubComponent } from './SubComponent';
```

### Git Commits

```
feat: add Stripe checkout to onboarding wizard
fix: tenant isolation leak in suppliers query
refactor: extract prompt builder to separate module
chore: update dependencies
docs: add multi-tenant architecture guide
```

---

<a id="armadilhas"></a>
## ARMADILHAS CONHECIDAS (do projeto LGM + novas)

1. **AUTH DEADLOCK:** NUNCA `await` Supabase calls dentro de `onAuthStateChange` callback.
2. **RLS recursion:** Policies que fazem query à mesma tabela → usar `SECURITY DEFINER` helpers.
3. **Edge function secrets:** Após adicionar secrets no Dashboard, pode precisar REDEPLOY.
4. **Gemini markdown wrapping:** Gemini devolve JSON com \`\`\`json wrapping → sempre limpar.
5. **French number parsing:** Vírgula é decimal, espaço é milhares. NUNCA confundir com US format.
6. **HEIC fotos iPhone:** Converter para JPEG antes de enviar ao Gemini.
7. **CORS placeholder:** NUNCA usar `{{CLIENT_DOMAIN}}` → sempre domínio real.
8. **Tenant ID leaks:** Se um componente ou query não filtra por tenant_id, é um data breach. Testar obsessivamente.
9. **Stripe webhook idempotency:** O mesmo evento pode chegar mais que uma vez. Usar `event.id` para deduplicar.
10. **OAuth token race condition:** Dois requests simultâneos podem tentar refresh do mesmo token. Usar lock ou `ON CONFLICT`.
11. **Multi-tenant cron:** O cron `sync-email` tem de iterar por todos os tenants, mas respeitar rate limits. Processar sequencialmente, não em paralelo.
12. **Supabase connection limits:** No plano atual, max 60 conexões diretas. Edge Functions usam connection pooling. Se muitos tenants, considerar pgBouncer.
13. **Storage bucket isolation:** O bucket de Storage é partilhado. Usar `tenant_id/` como prefix em todos os paths.
14. **I18n dynamic categories:** As categorias vêm do tenant, não do i18n estático. O i18n é para a UI, as categorias são dados.

---

<a id="checklist-deploy"></a>
## CHECKLIST DE DEPLOY

### Pré-Deploy
- [ ] `npm run build` sem erros
- [ ] `npm run lint` sem warnings críticos
- [ ] Testar localmente com `.env.local` correto
- [ ] Verificar que nenhuma API key está hardcoded no frontend
- [ ] Verificar que todas as Edge Functions têm CORS correto

### Deploy
1. **Supabase:** Aplicar migrações ao projeto existente (`wvopuqyotvwgronujvrb`) via SQL Editor ou `supabase db push`
2. **Edge Functions:** `supabase functions deploy --project-ref wvopuqyotvwgronujvrb`
3. **Vercel:** Push to main → auto-deploy
4. **Stripe:** Verificar webhooks apontam para o URL correto
5. **DNS:** Verificar custom domains resolvem corretamente

### Pós-Deploy
- [ ] Testar login
- [ ] Testar onboarding flow (com Stripe test mode)
- [ ] Testar upload de fatura
- [ ] Verificar error logging funciona
- [ ] Verificar Slack notifications chegam
- [ ] Monitorizar erros 30 minutos após deploy

---

## ORDEM DE EXECUÇÃO RECOMENDADA

```
SPRINT 1 (Semana 1-2): Fundação Multi-Tenant
├── Fase 0: Adicionar secrets novas ao Supabase Dashboard (Stripe, Slack, Resend)
├── Fase 1: Criar novas tabelas (tenants, plans, tenant_users, tickets, error_logs, onboarding_submissions)
├── Fase 1: Adicionar tenant_id às tabelas existentes (ALTER TABLE ADD COLUMN)
├── Fase 1: Seed dos 3 planos (Starter 39€, Pro 79€, Entreprise sur devis)
├── Fase 2: RLS multi-tenant + TenantContext + auth flow adaptado
├── Fase 2: Migrar dados LGM existentes como primeiro tenant
└── Testar: Isolamento multi-tenant funciona, LGM continua operacional

SPRINT 2 (Semana 2-3): Onboarding + Pagamento
├── Fase 5: Stripe integration (produtos, checkout para Starter/Pro, lead form para Entreprise)
├── Fase 3: Onboarding wizard (7 steps com UX mobile-first)
├── Fase 3: Step 7 bifurcado: Stripe Checkout (Starter/Pro) vs Formulário contacto (Entreprise)
├── Edge Function: provision-tenant (setup automático pós-pagamento)
├── Edge Function: stripe-webhook
└── Testar: Onboarding end-to-end com pagamento real (Stripe test mode)

SPRINT 3 (Semana 3-4): AI Dinâmico + Integrations
├── Fase 6: Prompt builder dinâmico por tenant (baseado no onboarding)
├── Fase 7: Adaptar Drive, Sheets, Gmail para multi-tenant (tenant_id em tudo)
├── Fase 8: Dashboard multi-tenant (widgets configuráveis, moeda, idioma)
└── Testar: Upload + AI + Drive funciona isoladamente por tenant

SPRINT 4 (Semana 4-5): Landing + Suporte
├── Fase 4: Landing page (Hero, Features, Pricing com Entreprise "Nous contacter", FAQ)
├── Fase 9: Ticket system + Feedback widget + Slack integration
├── Fase 10: Error logging robusto (frontend + Edge Functions + Slack alerts)
└── Testar: Flow completo end-to-end (landing → onboarding → app → ticket)

SPRINT 5 (Semana 5-6): Admin + Launch
├── Fase 11: Admin panel (tenants, tickets, errors, impersonation, Entreprise setup manual)
├── Fase 12: Security audit completo + testing multi-tenant
├── i18n: Expandir para EN + ES
├── Legal: Termos de serviço, privacy policy, GDPR
└── LAUNCH 🚀
```

---

## NOTAS FINAIS

- **DB já existe.** O Supabase `wvopuqyotvwgronujvrb` já está configurado com schema, RLS, Edge Functions e dados do LGM. Evoluir, não recriar.
- **LGM é o tenant #1.** Migrar os dados existentes do LGM como primeiro tenant. Ele continua a funcionar normalmente durante e após a migração.
- **Iterar rápido, não perfeito.** O MVP multi-tenant precisa de: onboarding, pagamento (Starter/Pro), AI processing, dashboard. Tudo o resto é nice-to-have.
- **Pricing:** Starter 39€, Pro 79€ (self-service via Stripe). Entreprise é sur devis — reunião pessoal, setup fully custom, domínio personalizado, sem limite. Preços ajustáveis conforme mercado.
- **Entreprise ≠ automático.** O plano Entreprise é o único que envolve intervenção humana: reunião pessoal, configuração custom, domínio dedicado. Starter e Pro são 100% self-service.
- **Microsoft integrations (OneDrive/Outlook) ficam para v2.** Começar só com Google.
- **Mobile-first no onboarding.** Muitos empresários vão preencher no telemóvel.
- **O segredo é o questionário.** Quanto melhor o questionário, menos intervenção humana. Investir tempo na UX das 20+ perguntas.