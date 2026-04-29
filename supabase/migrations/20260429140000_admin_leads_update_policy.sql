-- ============================================
-- Admin pode actualizar status dos enterprise_leads
-- ============================================
-- Sem esta policy, marcar lead como contactado/convertido falha silenciosamente
-- (UPDATE devolve 0 linhas afectadas por RLS).

DROP POLICY IF EXISTS "admin_update_leads" ON enterprise_leads;
CREATE POLICY "admin_update_leads" ON enterprise_leads FOR UPDATE TO authenticated
  USING (is_admin_global((select auth.uid())))
  WITH CHECK (is_admin_global((select auth.uid())));

-- Index para listagem ordenada por data
CREATE INDEX IF NOT EXISTS idx_enterprise_leads_created_at
  ON enterprise_leads (created_at DESC);
