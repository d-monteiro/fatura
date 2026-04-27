-- ============================================
-- FaturaAI — Baseline schema (multi-tenant)
-- ============================================
-- Reflecte o estado real da BD Postgres do projeto Supabase
-- `sxfwprydmllovnxxjhrh` para as tabelas principais.
--
-- Tabelas auxiliares (tickets, ticket_messages, error_logs, admin_users,
-- enterprise_leads, edge_rate_limits, user_roles_global) são criadas via
-- migrations em `supabase/migrations/` e não estão aqui — correr as
-- migrations por ordem depois deste ficheiro numa BD limpa.
--
-- AVISO: contém DROP/TRUNCATE no topo. Destrói dados existentes.

-- 0. WIPE LEGACY (sem dados de produção)
DROP TABLE IF EXISTS audit_log CASCADE;
DROP TABLE IF EXISTS invoice_line_items CASCADE;
DROP TABLE IF EXISTS invoices CASCADE;
DROP TABLE IF EXISTS suppliers CASCADE;
DROP TABLE IF EXISTS categories CASCADE;
DROP TABLE IF EXISTS email_accounts CASCADE;
DROP TABLE IF EXISTS user_oauth_tokens CASCADE;
DROP TABLE IF EXISTS companies CASCADE;
DROP TABLE IF EXISTS tenant_users CASCADE;
DROP TABLE IF EXISTS onboarding_submissions CASCADE;
DROP TABLE IF EXISTS tenants CASCADE;
DROP TABLE IF EXISTS plans CASCADE;

-- ============================================
-- 1. PLANS
-- ============================================
-- Preços em cêntimos (integer). Feature flags has_* controlam gating no
-- frontend via TenantContext. max_invoices_month NULL = ilimitado.
CREATE TABLE plans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,

  -- Pricing (cêntimos; NULL para custom/enterprise)
  price_monthly INTEGER,
  price_yearly INTEGER,
  stripe_price_id_monthly TEXT,
  stripe_price_id_yearly TEXT,
  setup_fee INTEGER DEFAULT 0,
  stripe_setup_price_id TEXT,
  is_custom_pricing BOOLEAN DEFAULT false,

  -- Limites
  max_invoices_month INTEGER,
  max_users INTEGER DEFAULT 1,
  max_companies INTEGER DEFAULT 1,

  -- Feature flags
  has_dashboard BOOLEAN DEFAULT true,
  has_drive_storage BOOLEAN DEFAULT true,
  has_manual_upload BOOLEAN DEFAULT true,
  has_email_sync BOOLEAN DEFAULT false,
  has_auto_sheets BOOLEAN DEFAULT false,
  has_reports BOOLEAN DEFAULT false,
  has_api_access BOOLEAN DEFAULT false,
  has_multi_user BOOLEAN DEFAULT false,
  has_priority_support BOOLEAN DEFAULT false,
  has_custom_branding BOOLEAN DEFAULT true,
  has_custom_domain BOOLEAN DEFAULT false,
  has_dedicated_account BOOLEAN DEFAULT false,

  -- Display PT (default)
  description TEXT,
  features_list JSONB,
  is_popular BOOLEAN DEFAULT false,
  cta_label TEXT DEFAULT 'Commencer',
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,

  -- Display EN
  description_en TEXT,
  features_list_en JSONB,
  cta_label_en TEXT
);

INSERT INTO plans (slug, name, price_monthly, price_yearly, max_invoices_month, has_email_sync, has_auto_sheets, has_multi_user, sort_order) VALUES
  ('starter',    'Starter',    3900,  NULL,  100,  false, false, false, 1),
  ('pro',        'Pro',        7900,  NULL,  500,  true,  true,  false, 2),
  ('entreprise', 'Empresarial', NULL, NULL,  NULL, true,  true,  true,  3);

-- ============================================
-- 2. TENANTS (uma por organização)
-- ============================================
-- country/language/timezone têm defaults FR herdados do arranque do projeto
-- em França. O RPC create_tenant_with_owner faz COALESCE para 'PT'/'pt'
-- quando não fornecidos, portanto tenants novos ficam em PT na prática.
CREATE TABLE tenants (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,

  -- Identidade
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  nif TEXT,
  sector TEXT,
  country TEXT DEFAULT 'FR',

  -- Branding
  logo_url TEXT,
  primary_color TEXT DEFAULT '#0E2435',
  secondary_color TEXT DEFAULT '#BBB388',

  -- Billing (Stripe)
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT,
  plan_id UUID REFERENCES plans(id),
  plan_status TEXT DEFAULT 'trialing' NOT NULL,
  trial_ends_at TIMESTAMPTZ,

  -- Uso (invoices_this_month é um contador legado; a query de uso real faz
  -- COUNT ao vivo em invoices respeitando invoices_month_reset como lower bound)
  invoices_this_month INTEGER DEFAULT 0,
  invoices_month_reset TIMESTAMPTZ,

  -- Onboarding
  onboarding_completed BOOLEAN DEFAULT false,
  onboarding_data JSONB,
  setup_status TEXT DEFAULT 'pending',
  setup_error TEXT,

  -- AI
  ai_prompt_config JSONB,
  invoice_name_variations TEXT[],

  -- Settings
  currency TEXT DEFAULT 'EUR',
  date_format TEXT DEFAULT 'DD/MM/YYYY',
  language TEXT DEFAULT 'fr',
  timezone TEXT DEFAULT 'Europe/Paris',

  -- Storage / Drive
  storage_provider TEXT DEFAULT 'google_drive',
  folder_structure TEXT DEFAULT 'year_type',
  auto_sheets BOOLEAN DEFAULT true,
  sheet_columns JSONB,
  drive_root_folder_id TEXT,
  drive_root_folder_name TEXT DEFAULT 'FATURAS',

  -- Dashboard / reports
  dashboard_widgets JSONB,
  auto_reports TEXT DEFAULT 'never',
  report_email TEXT,

  -- Status
  is_active BOOLEAN DEFAULT true,
  deleted_at TIMESTAMPTZ,

  -- Metadata
  referred_by TEXT,
  notes TEXT,

  CONSTRAINT tenants_onboarding_data_size CHECK (pg_column_size(onboarding_data) < 16384)
  -- NOTA: há também um CHECK `tenants_nif_format` em produção que usa
  -- a função is_valid_nif(nif, country). Está definido via migrations e não
  -- é recriado aqui para não depender de funções externas neste baseline.
);

CREATE INDEX idx_tenants_slug ON tenants(slug);
CREATE INDEX idx_tenants_active ON tenants(is_active) WHERE is_active = true;
CREATE INDEX idx_tenants_stripe ON tenants(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

-- ============================================
-- 3. TENANT_USERS (membership)
-- ============================================
CREATE TABLE tenant_users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member' NOT NULL,
  invited_by UUID REFERENCES auth.users(id),
  invited_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  UNIQUE(tenant_id, user_id)
);

CREATE INDEX idx_tenant_users_user ON tenant_users(user_id);
CREATE INDEX idx_tenant_users_tenant ON tenant_users(tenant_id);
CREATE INDEX idx_tenant_users_active ON tenant_users(user_id) WHERE is_active = true;

-- ============================================
-- 4. ONBOARDING_SUBMISSIONS (drafts + audit do wizard)
-- ============================================
CREATE TABLE onboarding_submissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  status TEXT DEFAULT 'draft',
  current_step INTEGER DEFAULT 1,
  block_company JSONB,
  block_invoice_intel JSONB,
  block_storage JSONB,
  block_dashboard JSONB,
  block_automation JSONB,
  sample_invoices TEXT[],
  logo_url TEXT,
  selected_plan TEXT,
  billing_cycle TEXT DEFAULT 'monthly',
  provisioning_started_at TIMESTAMPTZ,
  provisioning_completed_at TIMESTAMPTZ,
  provisioning_error TEXT,
  stripe_checkout_session_id TEXT,
  payment_completed BOOLEAN DEFAULT false
);

CREATE INDEX idx_onboarding_user ON onboarding_submissions(user_id);
CREATE INDEX idx_onboarding_status ON onboarding_submissions(status);

-- ============================================
-- 5. COMPANIES (entidades faturadas dentro de um tenant)
-- ============================================
CREATE TABLE companies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  short_name TEXT NOT NULL,
  nif TEXT,
  address TEXT,
  email TEXT,
  oauth_token_id UUID,
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  CONSTRAINT companies_nif_format CHECK (
    nif IS NULL OR nif = '' OR nif ~ '^[A-Z0-9-]{5,20}$'
  )
);

CREATE INDEX idx_companies_tenant ON companies(tenant_id);

-- ============================================
-- 6. SUPPLIERS (por tenant)
-- ============================================
CREATE TABLE suppliers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  display_name TEXT,
  nif TEXT,
  address TEXT,
  iban TEXT,
  invoice_count INTEGER DEFAULT 0,
  total_spent NUMERIC(14,2) DEFAULT 0,
  is_subcontractor BOOLEAN DEFAULT false,
  -- Variantes para normalização ("Point.P", "Point P Distribution" → "POINT P")
  name_variations TEXT[] DEFAULT ARRAY[]::TEXT[],
  deleted_at TIMESTAMPTZ,
  CONSTRAINT suppliers_nif_format CHECK (
    nif IS NULL OR nif = '' OR nif ~ '^[A-Z0-9-]{5,20}$'
  )
);

CREATE INDEX idx_suppliers_tenant ON suppliers(tenant_id);

-- ============================================
-- 7. CATEGORIES (1 eixo único 'category', is_fixed marca custos fixos)
-- ============================================
CREATE TABLE categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  axis TEXT NOT NULL DEFAULT 'category',
  code TEXT NOT NULL,
  label TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  is_fixed BOOLEAN NOT NULL DEFAULT false,
  UNIQUE(tenant_id, axis, code)
);

CREATE INDEX idx_categories_tenant ON categories(tenant_id);

-- ============================================
-- 8. INVOICES
-- ============================================
CREATE TABLE invoices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at TIMESTAMPTZ,

  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  company_id UUID NOT NULL REFERENCES companies(id),

  source TEXT DEFAULT 'upload',
  email_message_id TEXT,
  email_attachment_id TEXT,
  email_subject TEXT,
  email_from TEXT,
  email_received_at TIMESTAMPTZ,
  attachment_hash TEXT,

  file_url TEXT NOT NULL,
  storage_path TEXT,
  drive_link TEXT,
  drive_file_id TEXT,
  spreadsheet_id TEXT,

  document_type TEXT,
  category TEXT,

  doc_date DATE,
  doc_year INTEGER,
  data_vencimento DATE,

  supplier_name TEXT,
  supplier_nif TEXT,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  destinatario_nome TEXT,

  doc_number TEXT,

  valor_sem_iva NUMERIC(12,2),
  taxa_iva NUMERIC(5,2),
  valor_iva NUMERIC(12,2),
  valor_total NUMERIC(12,2),
  autoliquidacao BOOLEAN DEFAULT false,

  payment_method TEXT,
  supplier_iban TEXT,

  summary TEXT,
  confidence_score NUMERIC(5,2),

  paid_at TIMESTAMPTZ,
  payment_notified_at TIMESTAMPTZ,

  status TEXT DEFAULT 'pending',
  manual_review BOOLEAN DEFAULT false,
  review_reason TEXT
);

COMMENT ON COLUMN invoices.destinatario_nome IS 'Nome do destinatário extraído pelo Gemini — usado para detectar company correcta';

-- Dedup: mesma attachment Gmail não é inserida duas vezes
CREATE UNIQUE INDEX invoices_email_unique
  ON invoices (tenant_id, email_message_id, email_attachment_id)
  WHERE email_message_id IS NOT NULL;

-- Dedup por hash do ficheiro: mesmo PDF via diferentes emails/forwards
CREATE UNIQUE INDEX invoices_attachment_hash_unique
  ON invoices (tenant_id, attachment_hash)
  WHERE attachment_hash IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX idx_invoices_tenant ON invoices(tenant_id);
CREATE INDEX idx_invoices_company ON invoices(company_id);
CREATE INDEX idx_invoices_date ON invoices(doc_date DESC);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_deleted ON invoices(deleted_at) WHERE deleted_at IS NULL;

-- ============================================
-- 9. INVOICE LINE ITEMS
-- ============================================
CREATE TABLE invoice_line_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  line_number INTEGER NOT NULL,
  description TEXT,
  quantity NUMERIC(10,3),
  unit TEXT,
  preco_unitario NUMERIC(12,4),
  total_sem_iva NUMERIC(12,2),
  taxa_iva NUMERIC(5,2)
);

CREATE INDEX idx_line_items_invoice ON invoice_line_items(invoice_id);
CREATE INDEX idx_line_items_tenant ON invoice_line_items(tenant_id);

-- ============================================
-- 10. OAUTH TOKENS (por tenant)
-- ============================================
CREATE TABLE user_oauth_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  provider TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_expiry TIMESTAMPTZ,
  scopes TEXT[],
  email TEXT,
  is_primary_storage BOOLEAN DEFAULT false,
  UNIQUE(tenant_id, email, provider)
);

CREATE INDEX idx_oauth_tokens_user ON user_oauth_tokens(user_id);
CREATE INDEX idx_oauth_tokens_tenant ON user_oauth_tokens(tenant_id);

-- ============================================
-- 11. EMAIL ACCOUNTS (por tenant)
-- ============================================
CREATE TABLE email_accounts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  oauth_token_id UUID REFERENCES user_oauth_tokens(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  provider TEXT DEFAULT 'gmail',
  last_sync_at TIMESTAMPTZ,
  last_history_id TEXT,
  is_active BOOLEAN DEFAULT true
);

CREATE INDEX idx_email_accounts_tenant ON email_accounts(tenant_id);

-- ============================================
-- 12. AUDIT LOG
-- ============================================
-- record_id é TEXT porque suporta PKs UUID e TEXT (ex: tickets)
CREATE TABLE audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  action TEXT NOT NULL,
  old_values JSONB,
  new_values JSONB
);

CREATE INDEX idx_audit_log_record ON audit_log(table_name, record_id);
CREATE INDEX idx_audit_log_created ON audit_log(created_at DESC);
CREATE INDEX idx_audit_log_tenant ON audit_log(tenant_id);

-- ============================================
-- 13. STORAGE BUCKET
-- ============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('invoices', 'invoices', true)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 14. HELPER: updated_at triggers
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tenants_updated_at BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_invoices_updated_at BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_suppliers_updated_at BEFORE UPDATE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_oauth_updated_at BEFORE UPDATE ON user_oauth_tokens
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- 15. AUDIT TRIGGER (invoices)
-- ============================================
CREATE OR REPLACE FUNCTION log_invoice_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_log (tenant_id, user_id, table_name, record_id, action, old_values, new_values)
    VALUES (
      NEW.tenant_id, NEW.user_id, 'invoices', NEW.id::text,
      CASE WHEN OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN 'delete'
           WHEN OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN 'restore'
           WHEN OLD.status = 'review' AND NEW.status = 'processed' THEN 'approve'
           ELSE 'update' END,
      to_jsonb(OLD), to_jsonb(NEW)
    );
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log (tenant_id, user_id, table_name, record_id, action, new_values)
    VALUES (NEW.tenant_id, NEW.user_id, 'invoices', NEW.id::text, 'create', to_jsonb(NEW));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_invoices_audit AFTER INSERT OR UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION log_invoice_changes();

-- ============================================
-- 16. SUPPLIER STATS (contagem + total gasto)
-- ============================================
CREATE OR REPLACE FUNCTION update_supplier_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.supplier_id IS NOT NULL THEN
    UPDATE suppliers SET
      invoice_count = (SELECT count(*) FROM invoices WHERE supplier_id = NEW.supplier_id AND deleted_at IS NULL),
      total_spent = COALESCE((SELECT sum(valor_total) FROM invoices WHERE supplier_id = NEW.supplier_id AND deleted_at IS NULL), 0)
    WHERE id = NEW.supplier_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_supplier_stats AFTER INSERT OR UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION update_supplier_stats();

-- ============================================
-- 17. HELPER: tenant ids do user (SECURITY DEFINER, evita recursão RLS)
-- ============================================
CREATE OR REPLACE FUNCTION get_user_tenant_ids(uid UUID)
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT tenant_id FROM tenant_users WHERE user_id = uid;
$$;

GRANT EXECUTE ON FUNCTION get_user_tenant_ids(UUID) TO authenticated;
