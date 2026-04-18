-- Imutabilidade do corpo do ticket.
-- Substitui a policy "ALL" por policies por-comando e limita UPDATE ao
-- próprio utilizador + apenas às colunas `status` e `resolved_at` (fecho
-- self-service). Service role mantém bypass para ferramentas de admin.

DROP POLICY IF EXISTS "Tenant isolation" ON public.tickets;
DROP POLICY IF EXISTS "tickets_select_tenant" ON public.tickets;
DROP POLICY IF EXISTS "tickets_insert_own" ON public.tickets;
DROP POLICY IF EXISTS "tickets_update_own" ON public.tickets;

CREATE POLICY "tickets_select_tenant" ON public.tickets
  FOR SELECT
  USING (tenant_id IN (SELECT get_user_tenant_ids()));

CREATE POLICY "tickets_insert_own" ON public.tickets
  FOR INSERT
  WITH CHECK (
    tenant_id IN (SELECT get_user_tenant_ids())
    AND user_id = (select auth.uid())
  );

CREATE POLICY "tickets_update_own" ON public.tickets
  FOR UPDATE
  USING (
    user_id = (select auth.uid())
    AND tenant_id IN (SELECT get_user_tenant_ids())
  )
  WITH CHECK (
    user_id = (select auth.uid())
    AND tenant_id IN (SELECT get_user_tenant_ids())
  );

REVOKE UPDATE ON public.tickets FROM authenticated;
GRANT UPDATE (status, resolved_at) ON public.tickets TO authenticated;
