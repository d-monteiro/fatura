-- Pilar 5 (5.1 SAF-T, 5.2 Alertas de prazo, 5.3 UI Duplicados)
-- ============================================================
-- 5.2 — paid_at + payment_notified_at em invoices, trigger de reset,
--       índice para queries de "a pagar / por notificar".
-- 5.3 — dismissed_duplicates (pares marcados pelo user como "manter ambos")
--       + RPC find_potential_duplicates.
-- 5.1 — (sem schema: reutiliza invoices + invoice_line_items + suppliers +
--        companies; o NIF SAF-T vem de companies.nif, não de tenants.)

-- ==========================================
-- 5.2 — PAGAMENTOS
-- ==========================================

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_notified_at TIMESTAMPTZ;

-- Usado pelo cron check-due-dates e pelo widget "a pagar".
CREATE INDEX IF NOT EXISTS idx_invoices_due_unpaid
  ON invoices (tenant_id, date_echeance)
  WHERE deleted_at IS NULL AND paid_at IS NULL AND date_echeance IS NOT NULL;

-- Se o user editar date_echeance, a notificação antiga deixa de fazer
-- sentido: resetamos payment_notified_at para que o próximo cron considere
-- o novo prazo. Se editar paid_at, nada mais é preciso (cron já filtra).
CREATE OR REPLACE FUNCTION reset_payment_notified()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.date_echeance IS DISTINCT FROM OLD.date_echeance THEN
    NEW.payment_notified_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reset_payment_notified ON invoices;
CREATE TRIGGER trg_reset_payment_notified
  BEFORE UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION reset_payment_notified();

-- ==========================================
-- 5.3 — DUPLICADOS DESCARTADOS
-- ==========================================
-- Guarda pares (invoice_a, invoice_b) já revistos e marcados como "manter
-- ambos". A RPC filtra estes pares para não voltarem a aparecer no widget.

CREATE TABLE IF NOT EXISTS dismissed_duplicates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_a_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  invoice_b_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  dismissed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CHECK (invoice_a_id < invoice_b_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS dismissed_duplicates_pair_unique
  ON dismissed_duplicates (tenant_id, invoice_a_id, invoice_b_id);

ALTER TABLE dismissed_duplicates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members_all_dismissed_duplicates" ON dismissed_duplicates;
CREATE POLICY "members_all_dismissed_duplicates"
  ON dismissed_duplicates FOR ALL TO authenticated
  USING (tenant_id IN (SELECT get_user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids()));

DROP POLICY IF EXISTS "service_all_dismissed_duplicates" ON dismissed_duplicates;
CREATE POLICY "service_all_dismissed_duplicates"
  ON dismissed_duplicates FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ==========================================
-- 5.3 — RPC find_potential_duplicates
-- ==========================================
-- Devolve pares (a<b) que parecem duplicados, agrupados por heurística.
-- SECURITY DEFINER + filtro explícito por tenants do user para evitar leak.
-- O parâmetro p_company_id, quando não null, restringe a uma empresa.

CREATE OR REPLACE FUNCTION find_potential_duplicates(
  p_tenant_id UUID,
  p_company_id UUID DEFAULT NULL
)
RETURNS TABLE (
  invoice_a_id UUID,
  invoice_b_id UUID,
  match_kind TEXT,
  doc_number TEXT,
  supplier_name TEXT,
  supplier_id UUID,
  company_id UUID,
  montant_ttc NUMERIC,
  doc_date DATE
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH strong AS (
    SELECT
      LEAST(a.id, b.id) AS invoice_a_id,
      GREATEST(a.id, b.id) AS invoice_b_id,
      'doc_number'::text AS match_kind,
      a.doc_number,
      a.supplier_name,
      a.supplier_id,
      a.company_id,
      a.montant_ttc,
      a.doc_date
    FROM invoices a
    JOIN invoices b
      ON a.tenant_id = b.tenant_id
     AND a.company_id = b.company_id
     AND a.doc_number = b.doc_number
     AND a.supplier_name = b.supplier_name
     AND a.id < b.id
    WHERE a.tenant_id = p_tenant_id
      AND (p_company_id IS NULL OR a.company_id = p_company_id)
      AND p_tenant_id IN (SELECT get_user_tenant_ids())
      AND a.deleted_at IS NULL
      AND b.deleted_at IS NULL
      AND a.doc_number IS NOT NULL
      AND a.supplier_name IS NOT NULL
  ),
  soft AS (
    SELECT
      LEAST(a.id, b.id) AS invoice_a_id,
      GREATEST(a.id, b.id) AS invoice_b_id,
      'amount_date'::text AS match_kind,
      a.doc_number,
      a.supplier_name,
      a.supplier_id,
      a.company_id,
      a.montant_ttc,
      a.doc_date
    FROM invoices a
    JOIN invoices b
      ON a.tenant_id = b.tenant_id
     AND a.company_id = b.company_id
     AND a.supplier_id = b.supplier_id
     AND a.doc_date = b.doc_date
     AND abs(coalesce(a.montant_ttc, 0) - coalesce(b.montant_ttc, 0)) <= 0.01
     AND a.id < b.id
    WHERE a.tenant_id = p_tenant_id
      AND (p_company_id IS NULL OR a.company_id = p_company_id)
      AND p_tenant_id IN (SELECT get_user_tenant_ids())
      AND a.deleted_at IS NULL
      AND b.deleted_at IS NULL
      AND a.supplier_id IS NOT NULL
      AND a.doc_date IS NOT NULL
  ),
  unioned AS (
    -- Prioridade: se o mesmo par bate em ambos, fica com strong.
    SELECT * FROM strong
    UNION
    SELECT s.* FROM soft s
    WHERE NOT EXISTS (
      SELECT 1 FROM strong st
      WHERE st.invoice_a_id = s.invoice_a_id
        AND st.invoice_b_id = s.invoice_b_id
    )
  )
  SELECT u.invoice_a_id, u.invoice_b_id, u.match_kind, u.doc_number,
         u.supplier_name, u.supplier_id, u.company_id, u.montant_ttc, u.doc_date
  FROM unioned u
  WHERE NOT EXISTS (
    SELECT 1 FROM dismissed_duplicates d
    WHERE d.tenant_id = p_tenant_id
      AND d.invoice_a_id = u.invoice_a_id
      AND d.invoice_b_id = u.invoice_b_id
  )
  ORDER BY u.doc_date DESC NULLS LAST, u.invoice_a_id;
$$;

REVOKE ALL ON FUNCTION find_potential_duplicates(UUID, UUID) FROM public;
GRANT EXECUTE ON FUNCTION find_potential_duplicates(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION find_potential_duplicates(UUID, UUID) TO service_role;
