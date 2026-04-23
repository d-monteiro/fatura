-- ============================================
-- RPC get_tenant_owner_email
-- ============================================
-- Devolve o email do primeiro owner activo de um tenant (via auth.users).
-- SECURITY DEFINER isola o acesso a auth.users da Edge Function.
-- Sem argumento de auth.uid(): apenas service_role pode executar (usado pela
-- Edge Function send-auto-reports como fallback quando tenant.report_email
-- está vazio).

CREATE OR REPLACE FUNCTION get_tenant_owner_email(target_tenant UUID)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT au.email
  FROM tenant_users tu
  JOIN auth.users au ON au.id = tu.user_id
  WHERE tu.tenant_id = target_tenant
    AND tu.role = 'owner'
    AND tu.is_active = true
  ORDER BY tu.accepted_at NULLS LAST, tu.created_at
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION get_tenant_owner_email(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_tenant_owner_email(UUID) TO service_role;
