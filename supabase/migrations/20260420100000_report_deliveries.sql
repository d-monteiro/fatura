-- ============================================
-- Relatórios automáticos: tabela de entregas + default timezone
-- ============================================
-- Suporta idempotência por (tenant, kind, período) e auditoria de envios.
-- Preserva tenants legado em Europe/Paris; apenas novos tenants recebem
-- Europe/Lisbon por defeito.

ALTER TABLE tenants ALTER COLUMN timezone SET DEFAULT 'Europe/Lisbon';

CREATE TABLE IF NOT EXISTS report_deliveries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  period_kind     TEXT NOT NULL CHECK (period_kind IN ('weekly','monthly')),
  period_start    DATE NOT NULL,
  period_end      DATE NOT NULL,
  email_to        TEXT NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('sent','failed')),
  error           TEXT,
  message_id      TEXT,
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  invoices_count  INTEGER NOT NULL DEFAULT 0,
  total_ttc       NUMERIC(14,2) NOT NULL DEFAULT 0
);

-- Unique em (tenant, kind, periodStart): bloqueia double-send e retry no
-- mesmo período. Falhas carecem de intervenção manual (apagar a row).
CREATE UNIQUE INDEX IF NOT EXISTS report_deliveries_unique
  ON report_deliveries (tenant_id, period_kind, period_start);

CREATE INDEX IF NOT EXISTS idx_report_deliveries_tenant_sent
  ON report_deliveries (tenant_id, sent_at DESC);

ALTER TABLE report_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members_read_report_deliveries" ON report_deliveries;
CREATE POLICY "members_read_report_deliveries"
  ON report_deliveries FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT get_user_tenant_ids()));

DROP POLICY IF EXISTS "admin_read_all_report_deliveries" ON report_deliveries;
CREATE POLICY "admin_read_all_report_deliveries"
  ON report_deliveries FOR SELECT TO authenticated
  USING (is_admin_global((select auth.uid())));

DROP POLICY IF EXISTS "service_all_report_deliveries" ON report_deliveries;
CREATE POLICY "service_all_report_deliveries"
  ON report_deliveries FOR ALL TO service_role
  USING (true) WITH CHECK (true);
