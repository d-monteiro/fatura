-- ============================================
-- Pilar 3 (PLAN_FASE3): Múltiplos relatórios configuráveis por tenant
-- ============================================
-- Idempotente. Já aplicada em produção via dashboard SQL editor (drift);
-- esta migration regista o estado actual no repo para reprodução em
-- ambientes novos (dev local, branches Supabase, restore).
--
-- Mudanças vs 20260420100000_report_deliveries.sql:
--   - report_configs: nova tabela (N configs/tenant, 4 frequências, conteúdo
--     configurável, filtros por empresa/categoria, recipients[])
--   - report_deliveries: nova coluna config_id (FK SET NULL), expande
--     period_kind para daily/quarterly, novo unique condicional para coexistir
--     com entregas legacy sem config

CREATE TABLE IF NOT EXISTS report_configs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  frequency       TEXT NOT NULL CHECK (frequency IN ('daily','weekly','monthly','quarterly')),
  send_day        INTEGER NOT NULL DEFAULT 1,
  send_hour       INTEGER NOT NULL DEFAULT 8 CHECK (send_hour BETWEEN 0 AND 23),
  recipients      TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  content_options JSONB NOT NULL DEFAULT '{"alerts": true, "totals": true, "categories": true, "top_expenses": false, "top_suppliers": true}'::JSONB,
  filters         JSONB NOT NULL DEFAULT '{}'::JSONB,
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_report_configs_tenant_active
  ON report_configs (tenant_id, active);
CREATE INDEX IF NOT EXISTS idx_report_configs_active_freq
  ON report_configs (active, frequency) WHERE active = true;

CREATE OR REPLACE FUNCTION trg_report_configs_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS report_configs_touch ON report_configs;
CREATE TRIGGER report_configs_touch
  BEFORE UPDATE ON report_configs
  FOR EACH ROW EXECUTE FUNCTION trg_report_configs_touch_updated_at();

ALTER TABLE report_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members_read_report_configs" ON report_configs;
CREATE POLICY "members_read_report_configs"
  ON report_configs FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT get_user_tenant_ids()));

DROP POLICY IF EXISTS "writers_write_report_configs" ON report_configs;
CREATE POLICY "writers_write_report_configs"
  ON report_configs FOR ALL TO authenticated
  USING (can_write_tenant(tenant_id, (SELECT auth.uid())))
  WITH CHECK (can_write_tenant(tenant_id, (SELECT auth.uid())));

DROP POLICY IF EXISTS "admin_read_all_report_configs" ON report_configs;
CREATE POLICY "admin_read_all_report_configs"
  ON report_configs FOR SELECT TO authenticated
  USING (is_admin_global((SELECT auth.uid())));

DROP POLICY IF EXISTS "service_all_report_configs" ON report_configs;
CREATE POLICY "service_all_report_configs"
  ON report_configs FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- report_deliveries: ligar a config + suportar daily/quarterly + idempotência
-- legacy (config_id IS NULL) vs per-config (config_id IS NOT NULL).
ALTER TABLE report_deliveries
  ADD COLUMN IF NOT EXISTS config_id UUID REFERENCES report_configs(id) ON DELETE SET NULL;

ALTER TABLE report_deliveries
  DROP CONSTRAINT IF EXISTS report_deliveries_period_kind_check;
ALTER TABLE report_deliveries
  ADD CONSTRAINT report_deliveries_period_kind_check
  CHECK (period_kind IN ('daily','weekly','monthly','quarterly'));

-- Substitui o unique original por dois índices condicionais: assim configs
-- diferentes podem partilhar (tenant, kind, periodStart) sem conflito.
DROP INDEX IF EXISTS report_deliveries_unique;
CREATE UNIQUE INDEX IF NOT EXISTS report_deliveries_unique_legacy
  ON report_deliveries (tenant_id, period_kind, period_start)
  WHERE config_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS report_deliveries_unique_per_config
  ON report_deliveries (config_id, period_start)
  WHERE config_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_report_deliveries_tenant_kind_period
  ON report_deliveries (tenant_id, period_kind, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_report_deliveries_config_sent
  ON report_deliveries (config_id, sent_at DESC);
