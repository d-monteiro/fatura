-- ============================================
-- FaturaAI - LGM (Construction France)
-- Schema completo multi-empresa
-- ============================================
-- Executar no SQL Editor do Supabase (wvopuqyotvwgronujvrb)

-- 1. EMPRESAS
CREATE TABLE IF NOT EXISTS companies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  name TEXT NOT NULL,
  short_name TEXT NOT NULL,
  siret TEXT,
  siren TEXT,
  address TEXT,
  tva_intracom TEXT,
  is_active BOOLEAN DEFAULT true NOT NULL
);

-- Inserir as 3 empresas LGM
INSERT INTO companies (name, short_name) VALUES
  ('LGM', 'LGM'),
  ('Holding', 'HOLD'),
  ('Imobiliária', 'IMMO')
ON CONFLICT DO NOTHING;

-- 2. FORNECEDORES
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  name TEXT NOT NULL,
  display_name TEXT,
  siret TEXT,
  siren TEXT,
  tva_intracom TEXT,
  address TEXT,
  iban TEXT,
  default_metier TEXT,
  default_nature TEXT,
  default_cost_type TEXT,
  invoice_count INTEGER DEFAULT 0,
  total_spent NUMERIC(14,2) DEFAULT 0,
  is_sous_traitant BOOLEAN DEFAULT false,
  UNIQUE(name)
);

-- 3. FATURAS (tabela principal)
CREATE TABLE IF NOT EXISTS invoices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at TIMESTAMPTZ,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  company_id UUID NOT NULL REFERENCES companies(id),

  -- Source
  source TEXT DEFAULT 'upload' NOT NULL,
  email_message_id TEXT,
  UNIQUE(email_message_id),

  -- Storage
  file_url TEXT NOT NULL,
  storage_path TEXT,

  -- Google Drive
  drive_link TEXT,
  drive_file_id TEXT,

  -- AI extracted
  document_type TEXT,
  cost_type TEXT,
  metier TEXT,
  nature_depense TEXT,

  doc_date DATE,
  doc_year INTEGER,
  date_echeance DATE,

  supplier_name TEXT,
  supplier_siret TEXT,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,

  doc_number TEXT,

  -- Montants FR
  montant_ht NUMERIC(12,2),
  taux_tva NUMERIC(5,2),
  montant_tva NUMERIC(12,2),
  montant_ttc NUMERIC(12,2),
  autoliquidation BOOLEAN DEFAULT false,

  payment_method TEXT,
  supplier_iban TEXT,

  summary TEXT,
  confidence_score NUMERIC(5,2),

  -- Quality control
  status TEXT DEFAULT 'pending' NOT NULL,
  manual_review BOOLEAN DEFAULT false,
  review_reason TEXT,

  -- Spreadsheet
  spreadsheet_id TEXT
);

-- Indices faturas
CREATE INDEX IF NOT EXISTS idx_invoices_company ON invoices(company_id);
CREATE INDEX IF NOT EXISTS idx_invoices_user ON invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_doc_date ON invoices(doc_date DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_supplier_name ON invoices(supplier_name);
CREATE INDEX IF NOT EXISTS idx_invoices_supplier_id ON invoices(supplier_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_cost_type ON invoices(cost_type);
CREATE INDEX IF NOT EXISTS idx_invoices_metier ON invoices(metier);
CREATE INDEX IF NOT EXISTS idx_invoices_nature ON invoices(nature_depense);
CREATE INDEX IF NOT EXISTS idx_invoices_doc_year ON invoices(doc_year);
CREATE INDEX IF NOT EXISTS idx_invoices_deleted ON invoices(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_email_msg ON invoices(email_message_id) WHERE email_message_id IS NOT NULL;

-- 4. LINHAS DE FATURA
CREATE TABLE IF NOT EXISTS invoice_line_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  line_number INTEGER NOT NULL DEFAULT 1,
  description TEXT,
  quantity NUMERIC(10,3),
  unit TEXT,
  unit_price_ht NUMERIC(12,4),
  total_ht NUMERIC(12,2),
  taux_tva NUMERIC(5,2)
);

CREATE INDEX IF NOT EXISTS idx_line_items_invoice ON invoice_line_items(invoice_id);

-- 5. CATEGORIAS (configuráveis por empresa)
CREATE TABLE IF NOT EXISTS categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  axis TEXT NOT NULL,
  code TEXT NOT NULL,
  label_fr TEXT NOT NULL,
  label_pt TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  UNIQUE(company_id, axis, code)
);

-- Categorias default (shared = company_id NULL)
INSERT INTO categories (company_id, axis, code, label_fr, label_pt, sort_order) VALUES
  -- Métier
  (NULL, 'metier', 'electricite', 'Électricité', 'Eletricidade', 1),
  (NULL, 'metier', 'plomberie', 'Plomberie', 'Canalização', 2),
  (NULL, 'metier', 'chauffage', 'Chauffage', 'Aquecimento', 3),
  (NULL, 'metier', 'platrerie', 'Plâtrerie', 'Estuque', 4),
  (NULL, 'metier', 'autre', 'Autre', 'Outro', 99),
  -- Type coût
  (NULL, 'type_cout', 'cout_fixe', 'Coûts fixes', 'Custos fixos', 1),
  (NULL, 'type_cout', 'cout_variable', 'Coûts variables', 'Custos variáveis', 2),
  -- Nature dépense
  (NULL, 'nature_depense', 'materiaux', 'Matériaux', 'Materiais', 1),
  (NULL, 'nature_depense', 'sous_traitants', 'Sous-traitants', 'Subempreiteiros', 2),
  (NULL, 'nature_depense', 'location_materiel', 'Location matériel', 'Aluguer equipamento', 3),
  (NULL, 'nature_depense', 'restauration', 'Restauration', 'Alimentação', 4),
  (NULL, 'nature_depense', 'carburant', 'Carburant', 'Combustível', 5),
  (NULL, 'nature_depense', 'atelier', 'Atelier/Entrepôt', 'Oficina/Armazém', 6),
  (NULL, 'nature_depense', 'assurances', 'Assurances', 'Seguros', 7),
  (NULL, 'nature_depense', 'comptabilite', 'Comptabilité', 'Contabilidade', 8),
  (NULL, 'nature_depense', 'fournitures_bureau', 'Fournitures bureau', 'Material escritório', 9),
  (NULL, 'nature_depense', 'autre', 'Autre', 'Outro', 99)
ON CONFLICT DO NOTHING;

-- 6. CONTAS EMAIL
CREATE TABLE IF NOT EXISTS email_accounts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  provider TEXT DEFAULT 'gmail' NOT NULL,
  oauth_token_id UUID REFERENCES user_oauth_tokens(id) ON DELETE SET NULL,
  last_sync_at TIMESTAMPTZ,
  last_history_id TEXT,
  is_active BOOLEAN DEFAULT true,
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  UNIQUE(email)
);

-- 7. TOKENS OAUTH
CREATE TABLE IF NOT EXISTS user_oauth_tokens (
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

CREATE INDEX IF NOT EXISTS idx_oauth_user ON user_oauth_tokens(user_id);

-- 8. AUDIT LOG
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  action TEXT NOT NULL,
  old_values JSONB,
  new_values JSONB
);

CREATE INDEX IF NOT EXISTS idx_audit_record ON audit_log(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_date ON audit_log(created_at DESC);

-- 9. STORAGE BUCKET
INSERT INTO storage.buckets (id, name, public)
VALUES ('invoices', 'invoices', true)
ON CONFLICT (id) DO NOTHING;

-- 10. HELPER: updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_suppliers_updated_at
  BEFORE UPDATE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_oauth_updated_at
  BEFORE UPDATE ON user_oauth_tokens
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 11. HELPER: audit log trigger for invoices
CREATE OR REPLACE FUNCTION log_invoice_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_log (user_id, table_name, record_id, action, old_values, new_values)
    VALUES (
      NEW.user_id,
      'invoices',
      NEW.id,
      CASE WHEN OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN 'delete'
           WHEN OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN 'restore'
           WHEN OLD.status = 'review' AND NEW.status = 'processed' THEN 'approve'
           ELSE 'update'
      END,
      to_jsonb(OLD),
      to_jsonb(NEW)
    );
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log (user_id, table_name, record_id, action, new_values)
    VALUES (NEW.user_id, 'invoices', NEW.id, 'create', to_jsonb(NEW));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_invoices_audit
  AFTER INSERT OR UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION log_invoice_changes();

-- 12. HELPER: update supplier stats on invoice change
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

CREATE TRIGGER trg_supplier_stats
  AFTER INSERT OR UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION update_supplier_stats();
