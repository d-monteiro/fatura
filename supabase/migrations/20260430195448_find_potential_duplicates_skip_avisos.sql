-- B8 (parte dedup): se uma das duas é aviso_pagamento e a outra é fatura/recibo,
-- não é duplicado — é o ciclo normal "aviso → fatura". Só consideramos duplicado
-- quando ambos têm o MESMO document_type (ou ambos null/legacy).
--
-- Nota: aviso_pagamento + aviso_pagamento do mesmo email continua a marcar dup
-- (estratégia email_message), porque é caso de retry/anexo duplicado.

DROP FUNCTION IF EXISTS find_potential_duplicates(uuid, uuid);

CREATE OR REPLACE FUNCTION find_potential_duplicates(
  p_tenant_id uuid,
  p_company_id uuid DEFAULT NULL
)
RETURNS TABLE (
  invoice_a_id uuid,
  invoice_b_id uuid,
  match_kind text,
  doc_number text,
  supplier_name text,
  supplier_id uuid,
  company_id uuid,
  valor_total numeric,
  doc_date date
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT * FROM invoices
    WHERE tenant_id = p_tenant_id
      AND deleted_at IS NULL
      AND (p_company_id IS NULL OR company_id = p_company_id)
  ),
  email_msg AS (
    SELECT
      LEAST(a.id, b.id) AS invoice_a_id,
      GREATEST(a.id, b.id) AS invoice_b_id,
      'email_message'::text AS match_kind,
      a.doc_number, a.supplier_name, a.supplier_id,
      a.company_id, a.valor_total, a.doc_date
    FROM base a
    JOIN base b
      ON a.email_message_id = b.email_message_id
     AND a.id < b.id
     AND a.email_message_id IS NOT NULL
     -- B8: dois anexos do mesmo email só "duplicam" se forem do mesmo tipo
     -- (fatura+fatura, etc). Aviso de pagamento + fatura do mesmo email é
     -- ciclo normal e não deve ir para o widget.
     AND coalesce(a.document_type, '') IS NOT DISTINCT FROM coalesce(b.document_type, '')
  ),
  strong AS (
    SELECT
      LEAST(a.id, b.id) AS invoice_a_id,
      GREATEST(a.id, b.id) AS invoice_b_id,
      'doc_number'::text AS match_kind,
      a.doc_number, a.supplier_name, a.supplier_id,
      a.company_id, a.valor_total, a.doc_date
    FROM base a
    JOIN base b
      ON a.company_id = b.company_id
     AND a.id < b.id
     AND normalize_doc_number(a.doc_number) IS NOT NULL
     AND normalize_doc_number(a.doc_number) = normalize_doc_number(b.doc_number)
     AND coalesce(a.document_type, '') IS NOT DISTINCT FROM coalesce(b.document_type, '')
     AND (
       a.supplier_id = b.supplier_id
       OR (a.supplier_id IS NULL AND b.supplier_id IS NULL
           AND a.supplier_name = b.supplier_name AND a.supplier_name IS NOT NULL)
     )
  ),
  soft AS (
    SELECT
      LEAST(a.id, b.id) AS invoice_a_id,
      GREATEST(a.id, b.id) AS invoice_b_id,
      'amount_date'::text AS match_kind,
      a.doc_number, a.supplier_name, a.supplier_id,
      a.company_id, a.valor_total, a.doc_date
    FROM base a
    JOIN base b
      ON a.company_id = b.company_id
     AND a.id < b.id
     AND a.supplier_id = b.supplier_id
     AND a.doc_date = b.doc_date
     AND abs(coalesce(a.valor_total, 0) - coalesce(b.valor_total, 0)) <= 0.01
     AND a.supplier_id IS NOT NULL
     AND a.doc_date IS NOT NULL
     AND coalesce(a.document_type, '') IS NOT DISTINCT FROM coalesce(b.document_type, '')
  ),
  unioned AS (
    SELECT * FROM email_msg
    UNION ALL
    SELECT s.* FROM strong s
    WHERE NOT EXISTS (
      SELECT 1 FROM email_msg e
      WHERE e.invoice_a_id = s.invoice_a_id AND e.invoice_b_id = s.invoice_b_id
    )
    UNION ALL
    SELECT s.* FROM soft s
    WHERE NOT EXISTS (
      SELECT 1 FROM email_msg e
      WHERE e.invoice_a_id = s.invoice_a_id AND e.invoice_b_id = s.invoice_b_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM strong st
      WHERE st.invoice_a_id = s.invoice_a_id AND st.invoice_b_id = s.invoice_b_id
    )
  )
  SELECT u.invoice_a_id, u.invoice_b_id, u.match_kind, u.doc_number,
         u.supplier_name, u.supplier_id, u.company_id, u.valor_total, u.doc_date
  FROM unioned u
  WHERE p_tenant_id IN (SELECT get_user_tenant_ids())
    AND NOT EXISTS (
      SELECT 1 FROM dismissed_duplicates d
      WHERE d.tenant_id = p_tenant_id
        AND d.invoice_a_id = u.invoice_a_id
        AND d.invoice_b_id = u.invoice_b_id
    )
  ORDER BY u.doc_date DESC NULLS LAST, u.invoice_a_id;
$$;

REVOKE ALL ON FUNCTION find_potential_duplicates(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION find_potential_duplicates(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION find_potential_duplicates(uuid, uuid) TO service_role;
