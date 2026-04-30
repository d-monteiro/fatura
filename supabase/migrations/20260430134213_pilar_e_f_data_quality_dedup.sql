-- =================================================================
-- PILAR E + F — Qualidade de dados, dedup e tipos de documento
-- E1: refinar find_potential_duplicates (4ª estratégia + normalize doc_number)
-- E2: dedup fornecedores (NIF canónico + RPC merge + RPC find_duplicate_suppliers)
-- E5: document_type aviso_pagamento + backfill FR→PT
-- E6: normalize_nif_pt + backfill suppliers/invoices
-- F2: tenants.allowed_document_types text[]
-- =================================================================

-- ---------- Extensions ----------
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------- E6: NIF helpers ----------
-- Devolve só os 9 dígitos canónicos PT, ou NULL para qualquer outro formato
-- (estrangeiro, lixo, parcial). Usado em backfill, unique index e dedup.
CREATE OR REPLACE FUNCTION normalize_nif_pt(raw text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN raw IS NULL THEN NULL
    WHEN regexp_replace(raw, '[^0-9]', '', 'g') ~ '^[0-9]{9}$'
    THEN regexp_replace(raw, '[^0-9]', '', 'g')
    ELSE NULL
  END;
$$;

-- ---------- E2: Helper de normalização de nome de fornecedor ----------
-- lowercase + sem acentos + colapsa espaços + tira sufixos legais comuns.
CREATE OR REPLACE FUNCTION normalize_supplier_name(raw text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT trim(
    regexp_replace(
      regexp_replace(
        unaccent(lower(coalesce(raw, ''))),
        '[,.]+|\s+(lda|s\.?a\.?|sl|s\.?p\.?a\.?|gmbh|inc|ltd|limited|unipessoal)\b',
        ' ', 'g'
      ),
      '\s+', ' ', 'g'
    )
  );
$$;

-- ---------- E6: BACKFILL NIFs ----------
-- Aplica normalize_nif_pt a tudo o que dá: "PT517288605" → "517288605".
-- Estrangeiros (ESB81515520, IE9813461A) ficam intactos — normalize devolve
-- NULL e o COALESCE preserva o valor antigo.
UPDATE suppliers
SET nif = normalize_nif_pt(nif)
WHERE nif IS NOT NULL
  AND normalize_nif_pt(nif) IS NOT NULL
  AND nif <> normalize_nif_pt(nif);

UPDATE invoices
SET supplier_nif = normalize_nif_pt(supplier_nif)
WHERE supplier_nif IS NOT NULL
  AND normalize_nif_pt(supplier_nif) IS NOT NULL
  AND supplier_nif <> normalize_nif_pt(supplier_nif);

-- ---------- E2: Auto-merge de fornecedores duplicados por NIF canónico ----------
-- Antes do unique index, fundimos os pares óbvios. Mantém o supplier mais
-- antigo (created_at ASC) e move tudo para ele. O secundário é soft-deleted.
WITH dup AS (
  SELECT tenant_id, nif, array_agg(id ORDER BY created_at ASC) AS ids
  FROM suppliers
  WHERE nif IS NOT NULL AND deleted_at IS NULL
  GROUP BY tenant_id, nif
  HAVING count(*) > 1
),
moves AS (
  SELECT
    ids[1] AS primary_id,
    unnest(ids[2:array_length(ids, 1)]) AS secondary_id
  FROM dup
)
UPDATE invoices i
SET supplier_id = m.primary_id, updated_at = now()
FROM moves m
WHERE i.supplier_id = m.secondary_id;

WITH dup AS (
  SELECT tenant_id, nif, array_agg(id ORDER BY created_at ASC) AS ids
  FROM suppliers
  WHERE nif IS NOT NULL AND deleted_at IS NULL
  GROUP BY tenant_id, nif
  HAVING count(*) > 1
)
UPDATE suppliers s
SET deleted_at = now()
FROM dup d
WHERE s.tenant_id = d.tenant_id
  AND s.id = ANY(d.ids[2:array_length(d.ids, 1)])
  AND s.deleted_at IS NULL;

-- ---------- E2: Unique index por (tenant_id, nif) só para canónicos ----------
-- Aplica-se apenas a NIFs PT válidos canonizados; estrangeiros não dispara
-- conflito. Soft-deleted não conta (re-cria-se livremente após delete).
CREATE UNIQUE INDEX IF NOT EXISTS suppliers_tenant_nif_unique
  ON suppliers (tenant_id, normalize_nif_pt(nif))
  WHERE deleted_at IS NULL AND normalize_nif_pt(nif) IS NOT NULL;

-- ---------- E2: RPC merge_suppliers ----------
-- Move todas as faturas activas do secundário para o primário, recalcula
-- agregados, soft-delete do secundário. Idempotente. Authoriza por tenant.
CREATE OR REPLACE FUNCTION merge_suppliers(
  p_primary_id uuid,
  p_secondary_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_secondary_tenant_id uuid;
  v_moved int;
BEGIN
  IF p_primary_id = p_secondary_id THEN
    RAISE EXCEPTION 'Primário e secundário são o mesmo';
  END IF;

  SELECT tenant_id INTO v_tenant_id FROM suppliers WHERE id = p_primary_id AND deleted_at IS NULL;
  SELECT tenant_id INTO v_secondary_tenant_id FROM suppliers WHERE id = p_secondary_id AND deleted_at IS NULL;

  IF v_tenant_id IS NULL OR v_secondary_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Fornecedor não encontrado ou já eliminado';
  END IF;
  IF v_tenant_id <> v_secondary_tenant_id THEN
    RAISE EXCEPTION 'Tenant mismatch';
  END IF;
  IF v_tenant_id NOT IN (SELECT get_user_tenant_ids()) THEN
    RAISE EXCEPTION 'Sem acesso ao tenant';
  END IF;

  UPDATE invoices
  SET supplier_id = p_primary_id, updated_at = now()
  WHERE supplier_id = p_secondary_id;
  GET DIAGNOSTICS v_moved = ROW_COUNT;

  UPDATE suppliers
  SET deleted_at = now(), updated_at = now()
  WHERE id = p_secondary_id;

  PERFORM recalc_supplier_aggregates(p_primary_id);

  RETURN json_build_object('moved', v_moved, 'primary_id', p_primary_id);
END;
$$;

REVOKE ALL ON FUNCTION merge_suppliers(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION merge_suppliers(uuid, uuid) TO authenticated;

-- ---------- E2: RPC find_duplicate_suppliers ----------
-- Devolve pares (a < b) candidatos a fundir, agrupados por:
--   1) mesmo NIF canónico (alta confiança)
--   2) similaridade de nome >= 0.7 (baixa, requer revisão)
-- Filtra por tenant do utilizador. Devolve ordenado por confiança.
CREATE OR REPLACE FUNCTION find_duplicate_suppliers(p_tenant_id uuid)
RETURNS TABLE (
  supplier_a_id uuid,
  supplier_b_id uuid,
  match_kind text,        -- 'nif' | 'name'
  similarity numeric,
  name_a text,
  name_b text,
  nif_a text,
  nif_b text,
  invoice_count_a int,
  invoice_count_b int
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH same_nif AS (
    SELECT
      LEAST(a.id, b.id) AS supplier_a_id,
      GREATEST(a.id, b.id) AS supplier_b_id,
      'nif'::text AS match_kind,
      1.0::numeric AS similarity,
      a.name AS name_a, b.name AS name_b,
      a.nif AS nif_a, b.nif AS nif_b,
      coalesce(a.invoice_count, 0) AS invoice_count_a,
      coalesce(b.invoice_count, 0) AS invoice_count_b
    FROM suppliers a
    JOIN suppliers b
      ON a.tenant_id = b.tenant_id
     AND a.id < b.id
     AND normalize_nif_pt(a.nif) IS NOT NULL
     AND normalize_nif_pt(a.nif) = normalize_nif_pt(b.nif)
    WHERE a.tenant_id = p_tenant_id
      AND a.deleted_at IS NULL
      AND b.deleted_at IS NULL
  ),
  same_name AS (
    SELECT
      LEAST(a.id, b.id) AS supplier_a_id,
      GREATEST(a.id, b.id) AS supplier_b_id,
      'name'::text AS match_kind,
      similarity(normalize_supplier_name(a.name), normalize_supplier_name(b.name))::numeric AS similarity,
      a.name AS name_a, b.name AS name_b,
      a.nif AS nif_a, b.nif AS nif_b,
      coalesce(a.invoice_count, 0) AS invoice_count_a,
      coalesce(b.invoice_count, 0) AS invoice_count_b
    FROM suppliers a
    JOIN suppliers b
      ON a.tenant_id = b.tenant_id
     AND a.id < b.id
     AND similarity(normalize_supplier_name(a.name), normalize_supplier_name(b.name)) >= 0.7
    WHERE a.tenant_id = p_tenant_id
      AND a.deleted_at IS NULL
      AND b.deleted_at IS NULL
      AND coalesce(normalize_nif_pt(a.nif) <> normalize_nif_pt(b.nif), true)
  )
  SELECT * FROM same_nif
  WHERE p_tenant_id IN (SELECT get_user_tenant_ids())
  UNION ALL
  SELECT * FROM same_name
  WHERE p_tenant_id IN (SELECT get_user_tenant_ids())
    AND NOT EXISTS (
      SELECT 1 FROM same_nif n
      WHERE n.supplier_a_id = same_name.supplier_a_id
        AND n.supplier_b_id = same_name.supplier_b_id
    )
  ORDER BY match_kind, similarity DESC;
$$;

REVOKE ALL ON FUNCTION find_duplicate_suppliers(uuid) FROM public;
GRANT EXECUTE ON FUNCTION find_duplicate_suppliers(uuid) TO authenticated;

-- ---------- E5: backfill document_type FR→PT + aviso_pagamento ----------
UPDATE invoices SET document_type = 'fatura' WHERE document_type = 'facture';
UPDATE invoices SET document_type = 'recibo' WHERE document_type = 'recu';
UPDATE invoices SET document_type = 'outro' WHERE document_type = 'autre';

-- (Sem CHECK constraint actual em invoices.document_type — fica como TEXT
-- aberto; a validação real é no prompt + Edge Function.)

-- ---------- F2: tenants.allowed_document_types ----------
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS allowed_document_types text[]
    NOT NULL DEFAULT ARRAY['fatura', 'recibo', 'nota_credito']::text[];

-- Backfill: se existir onboarding_data.documentTypes, importar.
UPDATE tenants
SET allowed_document_types = ARRAY(
  SELECT DISTINCT lower(t)
  FROM jsonb_array_elements_text(coalesce(onboarding_data->'documentTypes', '[]'::jsonb)) t
)
WHERE jsonb_typeof(onboarding_data->'documentTypes') = 'array'
  AND jsonb_array_length(onboarding_data->'documentTypes') > 0;

-- ---------- E1: doc_number normalizer + nova find_potential_duplicates ----------
CREATE OR REPLACE FUNCTION normalize_doc_number(raw text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT NULLIF(
    regexp_replace(lower(coalesce(raw, '')), '[^a-z0-9]', '', 'g'),
    ''
  );
$$;

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
  -- Estratégia 1: mesmo email_message_id (>1 anexo do mesmo email viraram
  -- N invoices). Nem sempre são realmente duplicados — pode ser fatura +
  -- bilhete distintos — mas a frequência justifica revisão obrigatória.
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
  ),
  -- Estratégia 2 (strong): mesmo doc_number normalizado + mesmo supplier
  -- (id ou nome). Apanha "FT-2024/0001", "FT 2024/0001", "FT2024/0001".
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
     AND (
       a.supplier_id = b.supplier_id
       OR (a.supplier_id IS NULL AND b.supplier_id IS NULL
           AND a.supplier_name = b.supplier_name AND a.supplier_name IS NOT NULL)
     )
  ),
  -- Estratégia 3 (soft): supplier + data + valor. Threshold 1 cêntimo.
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
  ),
  -- Mantém match com maior prioridade: email_msg > strong > soft.
  unioned AS (
    SELECT * FROM email_msg
    UNION
    SELECT s.* FROM strong s
    WHERE NOT EXISTS (
      SELECT 1 FROM email_msg e
      WHERE e.invoice_a_id = s.invoice_a_id AND e.invoice_b_id = s.invoice_b_id
    )
    UNION
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
