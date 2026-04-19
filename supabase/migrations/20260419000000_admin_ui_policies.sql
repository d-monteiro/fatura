-- ============================================
-- Admin UI: policies de UPDATE + gestão de admins
-- ============================================

-- 1. admin pode fazer UPDATE em tenants (mudar plano, suspender, reactivar)
DROP POLICY IF EXISTS "admin_update_tenants" ON tenants;
CREATE POLICY "admin_update_tenants" ON tenants FOR UPDATE TO authenticated
  USING (is_admin_global((select auth.uid())))
  WITH CHECK (is_admin_global((select auth.uid())));

-- 2. admin pode fazer UPDATE em error_logs (marcar resolvido)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'error_logs') THEN
    EXECUTE 'DROP POLICY IF EXISTS "admin_update_error_logs" ON error_logs';
    EXECUTE 'CREATE POLICY "admin_update_error_logs" ON error_logs FOR UPDATE TO authenticated USING (is_admin_global((select auth.uid()))) WITH CHECK (is_admin_global((select auth.uid())))';
  END IF;
END $$;

-- 3. admin pode fazer UPDATE em onboarding_submissions
DROP POLICY IF EXISTS "admin_update_onboarding" ON onboarding_submissions;
CREATE POLICY "admin_update_onboarding" ON onboarding_submissions FOR UPDATE TO authenticated
  USING (is_admin_global((select auth.uid())))
  WITH CHECK (is_admin_global((select auth.uid())));

-- 4. admin lê/escreve admin_users
DROP POLICY IF EXISTS "admin_read_admins" ON admin_users;
CREATE POLICY "admin_read_admins" ON admin_users FOR SELECT TO authenticated
  USING (is_admin_global((select auth.uid())));

DROP POLICY IF EXISTS "admin_delete_admin" ON admin_users;
CREATE POLICY "admin_delete_admin" ON admin_users FOR DELETE TO authenticated
  USING (is_admin_global((select auth.uid())));

-- 5. RPC: adicionar admin por email (evita expor auth.users via API)
CREATE OR REPLACE FUNCTION add_admin_by_email(target_email TEXT, admin_note TEXT DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_id UUID;
BEGIN
  IF NOT is_admin_global((select auth.uid())) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT id INTO target_id FROM auth.users WHERE lower(email) = lower(trim(target_email)) LIMIT 1;
  IF target_id IS NULL THEN
    RAISE EXCEPTION 'user_not_found';
  END IF;

  INSERT INTO admin_users (user_id, note) VALUES (target_id, admin_note)
  ON CONFLICT (user_id) DO UPDATE SET note = COALESCE(EXCLUDED.note, admin_users.note);

  RETURN target_id;
END;
$$;

GRANT EXECUTE ON FUNCTION add_admin_by_email(TEXT, TEXT) TO authenticated;

-- 6. RPC: listar admins com email (join com auth.users sem expor a tabela)
CREATE OR REPLACE FUNCTION list_admins()
RETURNS TABLE (user_id UUID, email TEXT, note TEXT, created_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin_global((select auth.uid())) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
    SELECT a.user_id, u.email::TEXT, a.note, a.created_at
    FROM admin_users a
    JOIN auth.users u ON u.id = a.user_id
    ORDER BY a.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION list_admins() TO authenticated;
