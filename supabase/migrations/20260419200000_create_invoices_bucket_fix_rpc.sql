-- ============================================
-- 1. Criar bucket `invoices` (privado) — estava em falta, partiam uploads do email
-- 2. Corrigir ambiguity em get_admin_tenants_overview (invoices.created_at)
-- ============================================

-- 1. BUCKET (idempotente)
INSERT INTO storage.buckets (id, name, public)
VALUES ('invoices', 'invoices', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- As policies já estão criadas em 20260418100000_p0_security_hardening.sql

-- 2. RPC — qualificar created_at dentro do LATERAL para não colidir com a coluna
-- de retorno declarada na RETURNS TABLE (PL/pgSQL trata-a como variável).
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
      COUNT(*) FILTER (WHERE i.deleted_at IS NULL) AS total,
      COUNT(*) FILTER (
        WHERE i.deleted_at IS NULL
        AND i.created_at >= date_trunc('month', now())
        AND i.created_at < date_trunc('month', now()) + interval '1 month'
      ) AS this_month
    FROM invoices i WHERE i.tenant_id = t.id
  ) inv ON TRUE
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS total FROM suppliers s WHERE s.tenant_id = t.id
  ) sup ON TRUE
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS total FROM companies c WHERE c.tenant_id = t.id
  ) co ON TRUE
  WHERE t.deleted_at IS NULL
  ORDER BY t.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_admin_tenants_overview() TO authenticated;
