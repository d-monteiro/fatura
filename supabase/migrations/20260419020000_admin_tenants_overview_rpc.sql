-- RPC agregada: lista tenants + contagens reais (bypass de contador não-sincronizado)
CREATE OR REPLACE FUNCTION get_admin_tenants_overview()
RETURNS TABLE (
  id UUID,
  name TEXT,
  slug TEXT,
  country TEXT,
  sector TEXT,
  nif TEXT,
  plan_status TEXT,
  is_active BOOLEAN,
  setup_status TEXT,
  created_at TIMESTAMPTZ,
  invoices_total BIGINT,
  invoices_this_month BIGINT,
  suppliers_total BIGINT,
  companies_total BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin_global((select auth.uid())) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  SELECT
    t.id, t.name, t.slug, t.country, t.sector, t.nif,
    t.plan_status::TEXT, t.is_active, t.setup_status::TEXT, t.created_at,
    COALESCE(inv.total, 0) AS invoices_total,
    COALESCE(inv.this_month, 0) AS invoices_this_month,
    COALESCE(sup.total, 0) AS suppliers_total,
    COALESCE(co.total, 0) AS companies_total
  FROM tenants t
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) FILTER (WHERE deleted_at IS NULL) AS total,
      COUNT(*) FILTER (
        WHERE deleted_at IS NULL
        AND created_at >= date_trunc('month', now())
        AND created_at < date_trunc('month', now()) + interval '1 month'
      ) AS this_month
    FROM invoices WHERE tenant_id = t.id
  ) inv ON TRUE
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS total FROM suppliers WHERE tenant_id = t.id
  ) sup ON TRUE
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS total FROM companies WHERE tenant_id = t.id
  ) co ON TRUE
  WHERE t.deleted_at IS NULL
  ORDER BY t.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_admin_tenants_overview() TO authenticated;
