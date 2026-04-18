-- ============================================
-- P0 Security hardening — pré-launch 19/04/2026
-- ============================================
-- 1. Bucket invoices PRIVADO (era public=true, vazava todas as PDFs)
-- 2. Storage RLS com filtro de path por tenant (tenant_id/*)
-- 3. Coluna tenant_users.is_active (queries do código filtram por ela)
-- 4. auth_insert_tenant apertada (era WITH CHECK(true) — spam tenants)
-- 5. Helper is_admin_global + policies admin opt-in
-- 6. Trigger bloqueia UPDATE de tenant_id/user_id em invoices

-- 1. BUCKET PRIVADO
UPDATE storage.buckets SET public = false WHERE id = 'invoices';

-- 2. STORAGE RLS — filtrar por primeiro segmento do path = tenant_id
DROP POLICY IF EXISTS "auth_upload_invoices" ON storage.objects;
DROP POLICY IF EXISTS "auth_view_invoices" ON storage.objects;
DROP POLICY IF EXISTS "auth_delete_invoice_files" ON storage.objects;

CREATE POLICY "tenant_upload_invoices" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'invoices'
    AND (storage.foldername(name))[1]::uuid IN (SELECT get_user_tenant_ids((select auth.uid())))
  );

CREATE POLICY "tenant_view_invoices" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'invoices'
    AND (storage.foldername(name))[1]::uuid IN (SELECT get_user_tenant_ids((select auth.uid())))
  );

CREATE POLICY "tenant_delete_invoices" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'invoices'
    AND (storage.foldername(name))[1]::uuid IN (SELECT get_user_tenant_ids((select auth.uid())))
  );

CREATE POLICY "service_all_storage_invoices" ON storage.objects FOR ALL TO service_role
  USING (bucket_id = 'invoices') WITH CHECK (bucket_id = 'invoices');

-- 3. tenant_users.is_active (idempotente)
ALTER TABLE tenant_users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
CREATE INDEX IF NOT EXISTS idx_tenant_users_active ON tenant_users(user_id) WHERE is_active = true;

-- 4. auth_insert_tenant — só se o user ainda não é owner de nenhum tenant
DROP POLICY IF EXISTS "auth_insert_tenant" ON tenants;
CREATE POLICY "auth_insert_tenant" ON tenants FOR INSERT TO authenticated
  WITH CHECK (
    NOT EXISTS (
      SELECT 1 FROM tenant_users
      WHERE user_id = (select auth.uid()) AND role = 'owner' AND is_active = true
    )
  );

-- 5. Helper admin global + tabela admin_users (idempotente)
CREATE TABLE IF NOT EXISTS admin_users (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  note TEXT
);

ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "self_read_admin" ON admin_users;
CREATE POLICY "self_read_admin" ON admin_users FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));
DROP POLICY IF EXISTS "service_all_admin" ON admin_users;
CREATE POLICY "service_all_admin" ON admin_users FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION is_admin_global(uid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM admin_users WHERE user_id = uid);
$$;

GRANT EXECUTE ON FUNCTION is_admin_global(UUID) TO authenticated;

-- Policies admin opt-in (additive — coexiste com member policies via OR)
DROP POLICY IF EXISTS "admin_read_all_tenants" ON tenants;
CREATE POLICY "admin_read_all_tenants" ON tenants FOR SELECT TO authenticated
  USING (is_admin_global((select auth.uid())));

DROP POLICY IF EXISTS "admin_read_all_onboarding" ON onboarding_submissions;
CREATE POLICY "admin_read_all_onboarding" ON onboarding_submissions FOR SELECT TO authenticated
  USING (is_admin_global((select auth.uid())));

-- 6. Bloquear mudança de tenant_id/user_id em invoices (audit integrity)
CREATE OR REPLACE FUNCTION protect_invoice_ownership()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'tenant_id imutável em invoices';
  END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'user_id imutável em invoices';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoices_protect_owner ON invoices;
CREATE TRIGGER trg_invoices_protect_owner BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION protect_invoice_ownership();

-- 7. invoice_line_items.tenant_id tem de coincidir com parent invoice
CREATE OR REPLACE FUNCTION enforce_line_item_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  inv_tenant UUID;
BEGIN
  SELECT tenant_id INTO inv_tenant FROM invoices WHERE id = NEW.invoice_id;
  IF inv_tenant IS NULL THEN
    RAISE EXCEPTION 'invoice_id inválido';
  END IF;
  NEW.tenant_id := inv_tenant;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_line_items_tenant ON invoice_line_items;
CREATE TRIGGER trg_line_items_tenant BEFORE INSERT OR UPDATE ON invoice_line_items
  FOR EACH ROW EXECUTE FUNCTION enforce_line_item_tenant();
