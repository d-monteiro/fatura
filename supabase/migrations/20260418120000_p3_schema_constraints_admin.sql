-- ============================================
-- P3: constraints + colunas faltantes + admin RLS adicional
-- ============================================
-- 1. NIF CHECK constraints (PT format 9 dígitos)
-- 2. tenants.is_active (coluna fantasma referenciada pelo código)
-- 3. Admin RLS para tickets / ticket_messages / error_logs / enterprise_leads
-- 4. Audit log AFTER DELETE (service_role DELETE nunca logava)
-- 5. onboarding_data size cap (evitar JSON poluído unbounded)

-- 1. tenants.is_active
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
CREATE INDEX IF NOT EXISTS idx_tenants_active ON tenants(id) WHERE is_active = true AND deleted_at IS NULL;

-- 2. onboarding_data size cap 16KB
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_onboarding_data_size;
ALTER TABLE tenants ADD CONSTRAINT tenants_onboarding_data_size
  CHECK (pg_column_size(onboarding_data) < 16384);

-- 3. NIF format — PT default 9 dígitos; permite NULL e países não-PT
CREATE OR REPLACE FUNCTION is_valid_nif(nif_input TEXT, country_code TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN nif_input IS NULL OR nif_input = '' THEN true
    WHEN country_code = 'PT' THEN nif_input ~ '^[0-9]{9}$'
    ELSE true
  END;
$$;

ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_nif_format;
ALTER TABLE tenants ADD CONSTRAINT tenants_nif_format
  CHECK (is_valid_nif(nif, country));

ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_nif_format;
ALTER TABLE companies ADD CONSTRAINT companies_nif_format
  CHECK (nif IS NULL OR nif = '' OR nif ~ '^[A-Z0-9-]{5,20}$');

ALTER TABLE suppliers DROP CONSTRAINT IF EXISTS suppliers_nif_format;
ALTER TABLE suppliers ADD CONSTRAINT suppliers_nif_format
  CHECK (nif IS NULL OR nif = '' OR nif ~ '^[A-Z0-9-]{5,20}$');

-- 4. Admin RLS (idempotente) — tickets/error_logs/enterprise_leads se existirem
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tickets') THEN
    EXECUTE 'DROP POLICY IF EXISTS "admin_read_all_tickets" ON tickets';
    EXECUTE 'CREATE POLICY "admin_read_all_tickets" ON tickets FOR SELECT TO authenticated USING (is_admin_global((select auth.uid())))';
    EXECUTE 'DROP POLICY IF EXISTS "admin_update_tickets" ON tickets';
    EXECUTE 'CREATE POLICY "admin_update_tickets" ON tickets FOR UPDATE TO authenticated USING (is_admin_global((select auth.uid()))) WITH CHECK (is_admin_global((select auth.uid())))';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ticket_messages') THEN
    EXECUTE 'DROP POLICY IF EXISTS "admin_read_all_ticket_messages" ON ticket_messages';
    EXECUTE 'CREATE POLICY "admin_read_all_ticket_messages" ON ticket_messages FOR SELECT TO authenticated USING (is_admin_global((select auth.uid())))';
    EXECUTE 'DROP POLICY IF EXISTS "admin_insert_ticket_messages" ON ticket_messages';
    EXECUTE 'CREATE POLICY "admin_insert_ticket_messages" ON ticket_messages FOR INSERT TO authenticated WITH CHECK (is_admin_global((select auth.uid())) OR user_id = (select auth.uid()))';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'error_logs') THEN
    EXECUTE 'DROP POLICY IF EXISTS "admin_read_all_error_logs" ON error_logs';
    EXECUTE 'CREATE POLICY "admin_read_all_error_logs" ON error_logs FOR SELECT TO authenticated USING (is_admin_global((select auth.uid())))';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'enterprise_leads') THEN
    EXECUTE 'DROP POLICY IF EXISTS "admin_read_all_leads" ON enterprise_leads';
    EXECUTE 'CREATE POLICY "admin_read_all_leads" ON enterprise_leads FOR SELECT TO authenticated USING (is_admin_global((select auth.uid())))';
    -- Bloquear INSERT anon directo; submits fazem-se via Edge Function
    EXECUTE 'DROP POLICY IF EXISTS "anon_insert_lead" ON enterprise_leads';
    EXECUTE 'DROP POLICY IF EXISTS "public_insert_lead" ON enterprise_leads';
  END IF;
END $$;

-- 5. Audit log AFTER DELETE (service_role pode ainda fazer DELETE real — capturar)
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
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log (tenant_id, user_id, table_name, record_id, action, new_values)
    VALUES (NEW.tenant_id, NEW.user_id, 'invoices', NEW.id, 'create', to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_log (tenant_id, user_id, table_name, record_id, action, old_values)
    VALUES (OLD.tenant_id, OLD.user_id, 'invoices', OLD.id, 'hard_delete', to_jsonb(OLD));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_invoices_audit ON invoices;
CREATE TRIGGER trg_invoices_audit AFTER INSERT OR UPDATE OR DELETE ON invoices
  FOR EACH ROW EXECUTE FUNCTION log_invoice_changes();
