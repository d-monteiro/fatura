-- ============================================
-- FaturaAI - Multi-tenant Schema
-- ============================================
-- Executar no SQL Editor do Supabase.
-- AVISO: contém DROP/TRUNCATE — destrói dados legacy.

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

-- 1. PLANS
CREATE TABLE plans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  price_monthly NUMERIC(10,2),
  price_yearly NUMERIC(10,2),
  invoices_limit INTEGER,
  features JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

INSERT INTO plans (slug, name, price_monthly, price_yearly, invoices_limit) VALUES
  ('starter', 'Starter', 19, 190, 100),
  ('pro', 'Pro', 49, 490, 1000),
  ('entreprise', 'Empresarial', NULL, NULL, NULL);

-- 2. TENANTS (uma por organização)
CREATE TABLE tenants (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at TIMESTAMPTZ,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  nif TEXT,
  sector TEXT,
  country TEXT DEFAULT 'PT' NOT NULL,
  language TEXT DEFAULT 'pt' NOT NULL,
  currency TEXT DEFAULT 'EUR' NOT NULL,
  primary_color TEXT DEFAULT '#0E2435',
  secondary_color TEXT DEFAULT '#BBB388',
  plan_id UUID REFERENCES plans(id),
  plan_status TEXT DEFAULT 'trialing' NOT NULL,
  trial_ends_at TIMESTAMPTZ,
  onboarding_completed BOOLEAN DEFAULT false,
  setup_status TEXT DEFAULT 'pending',
  storage_provider TEXT DEFAULT 'google_drive',
  folder_structure TEXT DEFAULT 'year_month',
  auto_sheets BOOLEAN DEFAULT true,
  auto_reports TEXT DEFAULT 'never',
  invoice_name_variations TEXT[] DEFAULT ARRAY[]::TEXT[],
  drive_root_folder_id TEXT,
  drive_root_folder_name TEXT DEFAULT 'FATURAS',
  -- Catch-all para extras do onboarding (categories, topSuppliers, documentTypes, emailSync, emailAddresses)
  onboarding_data JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_tenants_slug ON tenants(slug);
CREATE INDEX idx_tenants_deleted ON tenants(deleted_at) WHERE deleted_at IS NULL;

-- 3. TENANT_USERS (membership)
CREATE TABLE tenant_users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member' NOT NULL,
  invited_at TIMESTAMPTZ DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(tenant_id, user_id)
);

CREATE INDEX idx_tenant_users_user ON tenant_users(user_id);
CREATE INDEX idx_tenant_users_tenant ON tenant_users(tenant_id);

-- 4. ONBOARDING_SUBMISSIONS (drafts + audit do wizard)
CREATE TABLE onboarding_submissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  current_step INTEGER DEFAULT 1,
  status TEXT DEFAULT 'draft' NOT NULL,
  block_company JSONB DEFAULT '{}'::jsonb,
  block_invoice_intel JSONB DEFAULT '{}'::jsonb,
  block_storage JSONB DEFAULT '{}'::jsonb,
  block_dashboard JSONB DEFAULT '{}'::jsonb,
  block_automation JSONB DEFAULT '{}'::jsonb,
  selected_plan TEXT,
  billing_cycle TEXT,
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  provisioning_completed_at TIMESTAMPTZ
);

CREATE INDEX idx_onboarding_user ON onboarding_submissions(user_id);

-- 5. COMPANIES (entidades faturadas dentro de um tenant)
CREATE TABLE companies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  name TEXT NOT NULL,
  short_name TEXT NOT NULL,
  nif TEXT,
  vat_number TEXT,
  address TEXT,
  is_active BOOLEAN DEFAULT true NOT NULL,
  is_default BOOLEAN DEFAULT false
);

CREATE INDEX idx_companies_tenant ON companies(tenant_id);

-- 6. SUPPLIERS (por tenant)
CREATE TABLE suppliers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  name TEXT NOT NULL,
  display_name TEXT,
  nif TEXT,
  vat_number TEXT,
  address TEXT,
  iban TEXT,
  default_metier TEXT,
  default_nature TEXT,
  default_cost_type TEXT,
  invoice_count INTEGER DEFAULT 0,
  total_spent NUMERIC(14,2) DEFAULT 0,
  is_subcontractor BOOLEAN DEFAULT false,
  -- Variantes alternativas para normalização ("Point.P", "Point P Distribution" → "POINT P")
  name_variations TEXT[] DEFAULT ARRAY[]::TEXT[],
  UNIQUE(tenant_id, name)
);

CREATE INDEX idx_suppliers_tenant ON suppliers(tenant_id);

-- 7. CATEGORIES (por tenant; eixos: cost_type / metier / nature_depense)
CREATE TABLE categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  axis TEXT NOT NULL,
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  UNIQUE(tenant_id, axis, code)
);

CREATE INDEX idx_categories_tenant ON categories(tenant_id);

-- 8. INVOICES
CREATE TABLE invoices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at TIMESTAMPTZ,

  source TEXT DEFAULT 'upload' NOT NULL,
  email_message_id TEXT,

  file_url TEXT NOT NULL,
  storage_path TEXT,
  drive_link TEXT,
  drive_file_id TEXT,
  spreadsheet_id TEXT,

  document_type TEXT,
  cost_type TEXT,
  metier TEXT,
  nature_depense TEXT,

  doc_date DATE,
  doc_year INTEGER,
  date_echeance DATE,

  supplier_name TEXT,
  supplier_nif TEXT,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,

  doc_number TEXT,

  montant_ht NUMERIC(12,2),
  taux_tva NUMERIC(5,2),
  montant_tva NUMERIC(12,2),
  montant_ttc NUMERIC(12,2),
  autoliquidation BOOLEAN DEFAULT false,

  payment_method TEXT,
  supplier_iban TEXT,

  summary TEXT,
  confidence_score NUMERIC(5,2),

  status TEXT DEFAULT 'pending' NOT NULL,
  manual_review BOOLEAN DEFAULT false,
  review_reason TEXT,

  UNIQUE(tenant_id, email_message_id)
);

CREATE INDEX idx_invoices_tenant ON invoices(tenant_id);
CREATE INDEX idx_invoices_company ON invoices(company_id);
CREATE INDEX idx_invoices_user ON invoices(user_id);
CREATE INDEX idx_invoices_doc_date ON invoices(doc_date DESC);
CREATE INDEX idx_invoices_supplier_name ON invoices(supplier_name);
CREATE INDEX idx_invoices_supplier_id ON invoices(supplier_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_cost_type ON invoices(cost_type);
CREATE INDEX idx_invoices_metier ON invoices(metier);
CREATE INDEX idx_invoices_nature ON invoices(nature_depense);
CREATE INDEX idx_invoices_doc_year ON invoices(doc_year);
CREATE INDEX idx_invoices_deleted ON invoices(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_invoices_email_msg ON invoices(email_message_id) WHERE email_message_id IS NOT NULL;

-- 9. INVOICE LINE ITEMS
CREATE TABLE invoice_line_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  line_number INTEGER NOT NULL DEFAULT 1,
  description TEXT,
  quantity NUMERIC(10,3),
  unit TEXT,
  unit_price_ht NUMERIC(12,4),
  total_ht NUMERIC(12,2),
  taux_tva NUMERIC(5,2)
);

CREATE INDEX idx_line_items_invoice ON invoice_line_items(invoice_id);
CREATE INDEX idx_line_items_tenant ON invoice_line_items(tenant_id);

-- 10. OAUTH TOKENS (por user; partilhado entre tenants do mesmo user)
CREATE TABLE user_oauth_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT DEFAULT 'google' NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_expiry TIMESTAMPTZ,
  scopes TEXT[],
  email TEXT,
  is_primary_storage BOOLEAN DEFAULT false,
  UNIQUE(email, provider)
);

CREATE INDEX idx_oauth_user ON user_oauth_tokens(user_id);

-- 11. EMAIL ACCOUNTS (por tenant)
CREATE TABLE email_accounts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  oauth_token_id UUID REFERENCES user_oauth_tokens(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  email TEXT NOT NULL,
  provider TEXT DEFAULT 'gmail' NOT NULL,
  last_sync_at TIMESTAMPTZ,
  last_history_id TEXT,
  is_active BOOLEAN DEFAULT true,
  UNIQUE(tenant_id, email)
);

CREATE INDEX idx_email_accounts_tenant ON email_accounts(tenant_id);

-- 12. AUDIT LOG
CREATE TABLE audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  action TEXT NOT NULL,
  old_values JSONB,
  new_values JSONB
);

CREATE INDEX idx_audit_record ON audit_log(table_name, record_id);
CREATE INDEX idx_audit_date ON audit_log(created_at DESC);
CREATE INDEX idx_audit_tenant ON audit_log(tenant_id);

-- 13. STORAGE BUCKET
INSERT INTO storage.buckets (id, name, public)
VALUES ('invoices', 'invoices', true)
ON CONFLICT (id) DO NOTHING;

-- 14. HELPER: updated_at
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
CREATE TRIGGER trg_onboarding_updated_at BEFORE UPDATE ON onboarding_submissions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 15. AUDIT TRIGGER
CREATE OR REPLACE FUNCTION log_invoice_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_log (tenant_id, user_id, table_name, record_id, action, old_values, new_values)
    VALUES (
      NEW.tenant_id, NEW.user_id, 'invoices', NEW.id,
      CASE WHEN OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN 'delete'
           WHEN OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN 'restore'
           WHEN OLD.status = 'review' AND NEW.status = 'processed' THEN 'approve'
           ELSE 'update' END,
      to_jsonb(OLD), to_jsonb(NEW)
    );
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log (tenant_id, user_id, table_name, record_id, action, new_values)
    VALUES (NEW.tenant_id, NEW.user_id, 'invoices', NEW.id, 'create', to_jsonb(NEW));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_invoices_audit AFTER INSERT OR UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION log_invoice_changes();

-- 16. SUPPLIER STATS
CREATE OR REPLACE FUNCTION update_supplier_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.supplier_id IS NOT NULL THEN
    UPDATE suppliers SET
      invoice_count = (SELECT count(*) FROM invoices WHERE supplier_id = NEW.supplier_id AND deleted_at IS NULL),
      total_spent = COALESCE((SELECT sum(montant_ttc) FROM invoices WHERE supplier_id = NEW.supplier_id AND deleted_at IS NULL), 0)
    WHERE id = NEW.supplier_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_supplier_stats AFTER INSERT OR UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION update_supplier_stats();

-- 17. HELPER: tenant ids do user actual (SECURITY DEFINER, evita recursão RLS)
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
