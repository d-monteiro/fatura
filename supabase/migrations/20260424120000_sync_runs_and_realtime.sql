-- sync_runs: estado e totais de cada execução do sync-email.
-- Alimenta banner "A sincronizar..." + toast de conclusão no frontend,
-- via Realtime subscription filtrada por tenant_id.

CREATE TABLE IF NOT EXISTS sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  trigger TEXT NOT NULL CHECK (trigger IN ('cron','manual','admin')),
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','done','error')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  total_messages INT NOT NULL DEFAULT 0,
  total_discovered INT NOT NULL DEFAULT 0,
  total_duplicates INT NOT NULL DEFAULT 0,
  total_rejected INT NOT NULL DEFAULT 0,
  total_skipped INT NOT NULL DEFAULT 0,
  total_errors INT NOT NULL DEFAULT 0,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS sync_runs_tenant_started_idx
  ON sync_runs (tenant_id, started_at DESC);
CREATE INDEX IF NOT EXISTS sync_runs_status_updated_idx
  ON sync_runs (status, updated_at)
  WHERE status = 'running';

CREATE TRIGGER trg_sync_runs_updated_at BEFORE UPDATE ON sync_runs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE sync_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role bypass" ON sync_runs FOR ALL TO public
  USING (true) WITH CHECK (true);

CREATE POLICY "Tenant isolation" ON sync_runs FOR ALL TO authenticated
  USING (tenant_id IN (SELECT get_user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids()));

-- Realtime publication: invoices para detectar novas/alteradas/ignoradas;
-- sync_runs para banner + toast seguirem o progresso.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='invoices'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.invoices;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='sync_runs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sync_runs;
  END IF;
END $$;
