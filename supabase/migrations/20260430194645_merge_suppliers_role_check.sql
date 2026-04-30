-- B2: bloqueia readonly e não-membros de chamar merge_suppliers.
-- Pilar C/permissions diz que só member+ pode fazer mutations; o gating UI
-- não é suficiente — qualquer cliente autenticado pode bater na RPC via
-- supabase.rpc(). Replicar a verificação aqui é defesa em profundidade.
--
-- Helper SECURITY DEFINER reusável para qualquer outra RPC futura que precise
-- do mesmo gate (find_potential_duplicates, etc — view-only continua a ser
-- aberto a readonly).

CREATE OR REPLACE FUNCTION public.tenant_user_can_write(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM tenant_users
    WHERE user_id = (select auth.uid())
      AND tenant_id = p_tenant_id
      AND is_active = true
      AND role IN ('owner', 'admin', 'member')
  );
$$;

REVOKE ALL ON FUNCTION public.tenant_user_can_write(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.tenant_user_can_write(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.merge_suppliers(
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
  IF NOT tenant_user_can_write(v_tenant_id) THEN
    RAISE EXCEPTION 'Sem permissão para fundir fornecedores neste tenant';
  END IF;

  UPDATE invoices
  SET supplier_id = p_primary_id, updated_at = now()
  WHERE supplier_id = p_secondary_id;
  GET DIAGNOSTICS v_moved = ROW_COUNT;

  UPDATE suppliers
  SET deleted_at = now(), updated_at = now()
  WHERE id = p_secondary_id;

  PERFORM recalc_supplier_aggregates(p_primary_id);
  PERFORM recalc_supplier_aggregates(p_secondary_id);

  RETURN json_build_object('moved', v_moved, 'primary_id', p_primary_id);
END;
$$;

REVOKE ALL ON FUNCTION public.merge_suppliers(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.merge_suppliers(uuid, uuid) TO authenticated;
