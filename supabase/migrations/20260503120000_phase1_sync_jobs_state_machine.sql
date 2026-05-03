-- =============================================================================
-- PLAN_HARDENING.md Fase 1 — Infra-estrutura para sync stateless idempotente
-- =============================================================================
-- Cria a tabela sync_jobs (pedido lógico de sincronização do user, com
-- paginação Gmail preservada e contadores por status) + colunas worker em
-- invoices (locking, retry, attempts) + função pick_invoices_for_processing
-- (FOR UPDATE SKIP LOCKED encapsulado).
--
-- O rename de sync_runs -> sync_runs_legacy fica adiado para a Fase 2:
-- a) o frontend usa Realtime subscription em sync_runs e Postgres logical
--    replication não emite eventos para views;
-- b) o sync-email actual ainda escreve em sync_runs e seria preciso tocar nele
--    nesta fase, contrariando "Não toca em edge functions ainda".
-- Quando sync-email for desactivado na Fase 2, o rename é seguro.
-- =============================================================================

-- 1. Tabela sync_jobs ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sync_jobs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email_account_id  uuid REFERENCES public.email_accounts(id) ON DELETE CASCADE,

  trigger           text NOT NULL CHECK (trigger IN ('cron','manual','backfill_3m','admin')),

  -- Janela temporal (NULL = "tudo o que Gmail devolver com newer_than:7d")
  date_from         timestamptz,
  date_to           timestamptz,

  -- Estado da paginação Gmail (preservado entre invocações dos workers)
  gmail_query       text NOT NULL,
  gmail_page_token  text,

  -- Contadores (atualizados pelos workers em batch)
  total_messages_seen     int NOT NULL DEFAULT 0,
  total_invoices_created  int NOT NULL DEFAULT 0,
  counts_by_status        jsonb NOT NULL DEFAULT '{}'::jsonb,

  status            text NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued','discovering','processing','done','paused_reauth','cancelled','error')),
  error_message     text,

  started_at        timestamptz NOT NULL DEFAULT now(),
  last_heartbeat_at timestamptz NOT NULL DEFAULT now(),
  completed_at      timestamptz,

  created_at        timestamptz NOT NULL DEFAULT now()
);

-- 1 job activo por tenant (UX clara, sem race conditions inter-job)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_sync_jobs_active_per_tenant
  ON public.sync_jobs (tenant_id)
  WHERE status IN ('queued','discovering','processing','paused_reauth');

-- Watchdog cron usa este index para detectar jobs sem heartbeat recente
CREATE INDEX IF NOT EXISTS idx_sync_jobs_pickup
  ON public.sync_jobs (status, last_heartbeat_at)
  WHERE status IN ('discovering','processing');

CREATE INDEX IF NOT EXISTS idx_sync_jobs_tenant_recent
  ON public.sync_jobs (tenant_id, created_at DESC);

-- 2. RLS em sync_jobs ---------------------------------------------------------
ALTER TABLE public.sync_jobs ENABLE ROW LEVEL SECURITY;

-- Service role bypass (workers correm com service_role)
CREATE POLICY "Service role bypass" ON public.sync_jobs FOR ALL TO public
  USING (true) WITH CHECK (true);

-- Members do tenant lêem os seus jobs
CREATE POLICY "members_read_sync_jobs" ON public.sync_jobs FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT get_user_tenant_ids()));

-- INSERT/UPDATE/DELETE: só service_role. Users criam jobs via Edge Function,
-- nunca direct (precisamos de validar email_account ownership e gerar gmail_query).

-- 3. Colunas worker em invoices ----------------------------------------------
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS attempts smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS locked_until timestamptz,
  ADD COLUMN IF NOT EXISTS sync_job_id uuid REFERENCES public.sync_jobs(id) ON DELETE SET NULL;

-- Index de pickup para os 4 workers (discover/fetch/analyze/finalize). Os
-- status 'discovered'/'analyzing'/'extracted' são valores string já hoje; o
-- analyzing existe há tempo, os outros 2 entram nas Fases 2-5.
CREATE INDEX IF NOT EXISTS idx_invoices_worker_pickup
  ON public.invoices (status, locked_until, next_retry_at)
  WHERE status IN ('discovered','analyzing','extracted')
    AND deleted_at IS NULL;

-- 4. Função pick_invoices_for_processing -------------------------------------
-- Encapsula o padrão SELECT FOR UPDATE SKIP LOCKED + lock + bump attempts.
-- Garante que N workers paralelos pegam N batches distintos sem coordenação
-- externa. locked_until liberta o item se o worker morrer (próximo cron pickup).
CREATE OR REPLACE FUNCTION public.pick_invoices_for_processing(
  p_status text,
  p_limit int DEFAULT 5,
  p_lock_seconds int DEFAULT 90
)
RETURNS SETOF public.invoices
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH picked AS (
    SELECT id
    FROM public.invoices
    WHERE status = p_status
      AND deleted_at IS NULL
      AND (locked_until IS NULL OR locked_until < now())
      AND (next_retry_at IS NULL OR next_retry_at < now())
      AND attempts < 3
    ORDER BY created_at
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.invoices
     SET locked_until = now() + (p_lock_seconds || ' seconds')::interval,
         attempts = attempts + 1
   WHERE id IN (SELECT id FROM picked)
  RETURNING *;
$$;

REVOKE ALL ON FUNCTION public.pick_invoices_for_processing(text, int, int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pick_invoices_for_processing(text, int, int) TO service_role;

COMMENT ON FUNCTION public.pick_invoices_for_processing(text, int, int) IS
  'Worker pickup com FOR UPDATE SKIP LOCKED. Marca locked_until + bump attempts. Service role only.';

-- 5. Trigger de heartbeat para sync_jobs --------------------------------------
-- Bump last_heartbeat_at em qualquer UPDATE para watchdog detectar jobs vivos.
-- clock_timestamp() em vez de now(): now() é constante dentro da transação,
-- o que faria o heartbeat ficar igual ao default original em UPDATEs imediatos.
CREATE OR REPLACE FUNCTION public.sync_jobs_touch_heartbeat()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.last_heartbeat_at IS NOT DISTINCT FROM OLD.last_heartbeat_at THEN
    NEW.last_heartbeat_at := clock_timestamp();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_jobs_heartbeat
  BEFORE UPDATE ON public.sync_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_jobs_touch_heartbeat();

-- 6. Realtime publication para sync_jobs --------------------------------------
-- UI de progresso em /sync/:job_id (Fase 7) precisa de eventos em tempo real
-- mesmo que polling seja a estratégia primária (D5).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='sync_jobs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sync_jobs;
  END IF;
END $$;

-- 7. Comentários documentais --------------------------------------------------
COMMENT ON TABLE public.sync_jobs IS
  'Pedido lógico de sincronização (cron/manual/backfill). 1 activo por tenant. Workers stateless competem por items via SKIP LOCKED.';
COMMENT ON COLUMN public.sync_jobs.gmail_page_token IS
  'Próximo pageToken Gmail. Preservado entre invocações de discover-emails para self-trigger não duplicar leituras.';
COMMENT ON COLUMN public.sync_jobs.counts_by_status IS
  'Contagem por status invoice. Ex: {"discovered":12,"analyzing":340,"completed":1200,"rejected":450,"failed_permanent":3}';
COMMENT ON COLUMN public.sync_jobs.last_heartbeat_at IS
  'Último UPDATE feito por um worker. Watchdog detecta jobs presos via < now() - 5min.';

COMMENT ON COLUMN public.invoices.attempts IS
  'Tentativas em fase actual (incrementado por pick_invoices_for_processing). Items com >=3 ficam em failed_permanent.';
COMMENT ON COLUMN public.invoices.locked_until IS
  'Lock de worker (now()+90s default). Se NULL ou expirado, próximo worker pega o item.';
COMMENT ON COLUMN public.invoices.next_retry_at IS
  'Backoff exponencial pós-erro (Fase 8). NULL = pode ser pickup imediatamente.';
COMMENT ON COLUMN public.invoices.sync_job_id IS
  'Foreign key para o sync_job que descobriu este item. Permite progress UI por job.';
