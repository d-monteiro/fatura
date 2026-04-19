-- RPC agregada para drawer de tenant no admin
CREATE OR REPLACE FUNCTION get_tenant_details(target_tenant UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
BEGIN
  IF NOT is_admin_global((select auth.uid())) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT jsonb_build_object(
    'invoices_total', (SELECT COUNT(*) FROM invoices WHERE tenant_id = target_tenant AND deleted_at IS NULL),
    'invoices_trashed', (SELECT COUNT(*) FROM invoices WHERE tenant_id = target_tenant AND deleted_at IS NOT NULL),
    'companies_total', (SELECT COUNT(*) FROM companies WHERE tenant_id = target_tenant),
    'suppliers_total', (SELECT COUNT(*) FROM suppliers WHERE tenant_id = target_tenant),
    'members', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'user_id', tu.user_id,
        'email', u.email,
        'role', tu.role,
        'is_active', tu.is_active,
        'accepted_at', tu.accepted_at
      ) ORDER BY tu.created_at)
      FROM tenant_users tu
      JOIN auth.users u ON u.id = tu.user_id
      WHERE tu.tenant_id = target_tenant
    ), '[]'::jsonb),
    'recent_errors', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'level', level, 'message', message, 'source', source,
        'created_at', created_at, 'resolved', resolved
      ) ORDER BY created_at DESC)
      FROM (
        SELECT * FROM error_logs WHERE tenant_id = target_tenant
        ORDER BY created_at DESC LIMIT 5
      ) e
    ), '[]'::jsonb),
    'plan', (
      SELECT jsonb_build_object('id', p.id, 'name', p.name, 'slug', p.slug)
      FROM tenants t LEFT JOIN plans p ON p.id = t.plan_id
      WHERE t.id = target_tenant
    )
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_tenant_details(UUID) TO authenticated;
