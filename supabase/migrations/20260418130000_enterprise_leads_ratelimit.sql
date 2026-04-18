-- ============================================
-- Tabela enterprise_leads versionada + rate-limit
-- ============================================
-- enterprise_leads provavelmente já existe em cloud sem migration.
-- Idempotente via CREATE TABLE IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS enterprise_leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  company_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  sector TEXT,
  country TEXT,
  invoices_per_month INTEGER,
  availability TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  CONSTRAINT enterprise_leads_email_format CHECK (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  CONSTRAINT enterprise_leads_notes_size CHECK (notes IS NULL OR length(notes) <= 2000),
  CONSTRAINT enterprise_leads_name_size CHECK (length(company_name) <= 200 AND length(contact_name) <= 200)
);

ALTER TABLE enterprise_leads ENABLE ROW LEVEL SECURITY;

-- Não permitir INSERT directo do frontend (apenas via Edge Function com service-role)
DROP POLICY IF EXISTS "public_insert_lead" ON enterprise_leads;
DROP POLICY IF EXISTS "anon_insert_lead" ON enterprise_leads;
DROP POLICY IF EXISTS "auth_insert_lead" ON enterprise_leads;

DROP POLICY IF EXISTS "service_all_leads" ON enterprise_leads;
CREATE POLICY "service_all_leads" ON enterprise_leads FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "admin_read_all_leads" ON enterprise_leads;
CREATE POLICY "admin_read_all_leads" ON enterprise_leads FOR SELECT TO authenticated
  USING (is_admin_global((select auth.uid())));

-- Rate limit table — chave (endpoint, client_id) com TTL via created_at
CREATE TABLE IF NOT EXISTS edge_rate_limits (
  endpoint TEXT NOT NULL,
  client_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (endpoint, client_id, created_at)
);

CREATE INDEX IF NOT EXISTS idx_edge_rate_limits_lookup
  ON edge_rate_limits (endpoint, client_id, created_at DESC);

ALTER TABLE edge_rate_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_all_rate_limits" ON edge_rate_limits;
CREATE POLICY "service_all_rate_limits" ON edge_rate_limits FOR ALL TO service_role USING (true) WITH CHECK (true);

-- GC: limpar entradas com mais de 1 hora (função + cron job a adicionar se quiseres)
CREATE OR REPLACE FUNCTION gc_edge_rate_limits() RETURNS void
LANGUAGE sql
AS $$
  DELETE FROM edge_rate_limits WHERE created_at < now() - interval '1 hour';
$$;
