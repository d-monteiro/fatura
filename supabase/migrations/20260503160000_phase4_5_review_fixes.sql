-- =============================================================================
-- PLAN_HARDENING.md Fases 4 + 5 — Review fixes (post code review)
-- =============================================================================
-- Resolve B1, B2, B3, B4, S1-S8 + N5/N6/N7/N8 do code review feito após
-- 20260503150000. Fixes principais:
--   1. lock_release_count: protecção contra Edge runtime kill silencioso (S5).
--      Independente de attempts (que só bumpa em falha logical do worker).
--   2. invoices_bump_sync_run_rejected ignora status='cancelled' (B1).
--   3. bump_invoice_attempt RPC: incremento atómico, evita race entre workers
--      paralelos a fazer item.attempts+1 em JS (B3).
--   4. refresh_sync_job_counts RPC: GROUP BY no Postgres em vez de SELECT-all
--      em JS por cada batch (S2). Também populate sync_jobs.error_message
--      quando há failed_permanent (S7+N8).
--   5. has_pickable_invoices_for_* predicates: source-of-truth única para
--      filtros pickup vs filtros watchdog (S6).
--   6. pick_invoices_* recreadas com lock_release_count<3 e SECURITY INVOKER
--      (S3).
--   7. Watchdog refactorado a usar trigger_sync_worker (sem hardcoded secret
--      por cada bloco, N5) + transição cancelled→completed (S4).
-- =============================================================================

-- 1. Coluna lock_release_count -----------------------------------------------
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS lock_release_count smallint NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.invoices.lock_release_count IS
  'Vezes que o watchdog forçou release do lock por expiração. >=3 → failed_permanent. Protege contra Edge runtime kill silencioso (worker morre antes de bumpar attempts).';

-- 2. Trigger reset attempts: também reseta lock_release_count -----------------
CREATE OR REPLACE FUNCTION public.invoices_reset_attempts_on_status_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.attempts := 0;
    NEW.lock_release_count := 0;
    NEW.locked_until := NULL;
    NEW.next_retry_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- 3. Trigger total_rejected ignora cancelled ---------------------------------
CREATE OR REPLACE FUNCTION public.invoices_bump_sync_run_rejected()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  was_rejected boolean := (TG_OP = 'UPDATE'
    AND OLD.deleted_at IS NOT NULL
    AND OLD.status <> 'cancelled');
  is_rejected boolean := (NEW.deleted_at IS NOT NULL
    AND NEW.status <> 'cancelled');
  delta int := 0;
BEGIN
  IF NEW.sync_run_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF is_rejected THEN delta := 1; END IF;
  ELSE
    IF is_rejected AND NOT was_rejected THEN delta := 1;
    ELSIF was_rejected AND NOT is_rejected THEN delta := -1;
    END IF;
  END IF;

  IF delta <> 0 THEN
    UPDATE public.sync_runs
       SET total_rejected = GREATEST(total_rejected + delta, 0)
     WHERE id = NEW.sync_run_id;
  END IF;

  RETURN NEW;
END;
$$;

-- 4. RPC bump_invoice_attempt (incremento atómico) ---------------------------
CREATE OR REPLACE FUNCTION public.bump_invoice_attempt(
  p_id uuid,
  p_expected_status text,
  p_last_error text,
  p_next_retry_at timestamptz DEFAULT NULL
)
RETURNS smallint
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  UPDATE public.invoices
     SET attempts = attempts + 1,
         locked_until = NULL,
         last_error = p_last_error,
         next_retry_at = COALESCE(p_next_retry_at, next_retry_at)
   WHERE id = p_id
     AND status = p_expected_status
  RETURNING attempts;
$$;

REVOKE ALL ON FUNCTION public.bump_invoice_attempt(uuid, text, text, timestamptz) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bump_invoice_attempt(uuid, text, text, timestamptz) TO service_role;

COMMENT ON FUNCTION public.bump_invoice_attempt(uuid, text, text, timestamptz) IS
  'Incremento atómico de attempts em falha logical. WHERE status=expected protege contra sobrepor reset do trigger quando outro path mudou status. Evita race item.attempts+1 em JS entre workers paralelos.';

-- 5. RPC refresh_sync_job_counts (GROUP BY no Postgres + heartbeat fresco) ---
CREATE OR REPLACE FUNCTION public.refresh_sync_job_counts(p_job_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_counts jsonb;
  v_failed_perm int;
BEGIN
  SELECT
    COALESCE(jsonb_object_agg(status, c), '{}'::jsonb),
    COALESCE(SUM(CASE WHEN status = 'failed_permanent' THEN c ELSE 0 END), 0)
    INTO v_counts, v_failed_perm
  FROM (
    SELECT i.status, count(*)::int AS c
    FROM public.invoices i
    WHERE i.sync_job_id = p_job_id
    GROUP BY i.status
  ) s;

  UPDATE public.sync_jobs
     SET counts_by_status = v_counts,
         last_heartbeat_at = clock_timestamp(),
         error_message = CASE
           WHEN v_failed_perm > 0 THEN format('failed_permanent: %s', v_failed_perm)
           ELSE error_message
         END
   WHERE id = p_job_id;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_sync_job_counts(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_sync_job_counts(uuid) TO service_role;

COMMENT ON FUNCTION public.refresh_sync_job_counts(uuid) IS
  'Snapshot agregado dos invoices do job + heartbeat com clock_timestamp() (now() é constante na transação). Substitui SELECT-all + JS reduce dos workers que era O(N) por batch.';

-- 6. Predicates partilhados watchdog/workers ---------------------------------
CREATE OR REPLACE FUNCTION public.has_pickable_invoices_for_processing(p_status text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.invoices
    WHERE status = p_status
      AND deleted_at IS NULL
      AND (locked_until IS NULL OR locked_until < now())
      AND (next_retry_at IS NULL OR next_retry_at < now())
      AND attempts < 3
      AND lock_release_count < 3
  );
$$;

CREATE OR REPLACE FUNCTION public.has_pickable_invoices_for_finalize()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.invoices
    WHERE status IN ('extracted','review')
      AND deleted_at IS NULL
      AND drive_file_id IS NULL
      AND storage_path IS NOT NULL
      AND (locked_until IS NULL OR locked_until < now())
      AND (next_retry_at IS NULL OR next_retry_at < now())
      AND attempts < 3
      AND lock_release_count < 3
  );
$$;

REVOKE ALL ON FUNCTION public.has_pickable_invoices_for_processing(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_pickable_invoices_for_processing(text) TO service_role;
REVOKE ALL ON FUNCTION public.has_pickable_invoices_for_finalize() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_pickable_invoices_for_finalize() TO service_role;

COMMENT ON FUNCTION public.has_pickable_invoices_for_processing(text) IS
  'Source-of-truth do filtro pickup: usado pelo watchdog (decide se dispara worker) e pelos workers (decide self-trigger). Evita drift entre RPC pick e cron.';

-- 7. pick_invoices_for_processing recriada (lock_release_count guard) --------
DROP FUNCTION IF EXISTS public.pick_invoices_for_processing(text, int, int);

CREATE FUNCTION public.pick_invoices_for_processing(
  p_status text,
  p_limit int DEFAULT 5,
  p_lock_seconds int DEFAULT 90
)
RETURNS SETOF public.invoices
LANGUAGE sql
SECURITY INVOKER
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
      AND lock_release_count < 3
    ORDER BY created_at, id
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.invoices
     SET locked_until = now() + (p_lock_seconds || ' seconds')::interval
   WHERE id IN (SELECT id FROM picked)
  RETURNING *;
$$;

REVOKE ALL ON FUNCTION public.pick_invoices_for_processing(text, int, int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pick_invoices_for_processing(text, int, int) TO service_role;

COMMENT ON FUNCTION public.pick_invoices_for_processing(text, int, int) IS
  'Worker pickup com FOR UPDATE SKIP LOCKED. Marca locked_until apenas. Filtro alinhado com has_pickable_invoices_for_processing. Service role only.';

-- 8. pick_invoices_for_finalize recriada (SECURITY INVOKER + guard) ----------
DROP FUNCTION IF EXISTS public.pick_invoices_for_finalize(int, int);

CREATE FUNCTION public.pick_invoices_for_finalize(
  p_limit int DEFAULT 5,
  p_lock_seconds int DEFAULT 180
)
RETURNS SETOF public.invoices
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  WITH picked AS (
    SELECT id
    FROM public.invoices
    WHERE status IN ('extracted','review')
      AND deleted_at IS NULL
      AND drive_file_id IS NULL
      AND storage_path IS NOT NULL
      AND (locked_until IS NULL OR locked_until < now())
      AND (next_retry_at IS NULL OR next_retry_at < now())
      AND attempts < 3
      AND lock_release_count < 3
    ORDER BY created_at, id
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.invoices
     SET locked_until = now() + (p_lock_seconds || ' seconds')::interval
   WHERE id IN (SELECT id FROM picked)
  RETURNING *;
$$;

REVOKE ALL ON FUNCTION public.pick_invoices_for_finalize(int, int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pick_invoices_for_finalize(int, int) TO service_role;

COMMENT ON FUNCTION public.pick_invoices_for_finalize(int, int) IS
  'Worker pickup para finalize-batch (Drive+Sheets). SECURITY INVOKER (service_role bypassa RLS). Filtro alinhado com has_pickable_invoices_for_finalize.';

-- 9. Watchdog refactorado ----------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-jobs-watchdog') THEN
    PERFORM cron.unschedule('sync-jobs-watchdog');
  END IF;
END $$;

SELECT cron.schedule(
  'sync-jobs-watchdog',
  '* * * * *',
  $cmd$
    -- 5a. Discover: jobs sem heartbeat recente.
    SELECT public.trigger_sync_worker('discover-emails', jsonb_build_object('sync_job_id', sj.id))
      FROM public.sync_jobs sj
     WHERE sj.status IN ('queued','discovering')
       AND sj.last_heartbeat_at < now() - interval '90 seconds';

    -- 5b. Fetch: discovered livres.
    SELECT public.trigger_sync_worker('fetch-attachments', '{}'::jsonb)
     WHERE public.has_pickable_invoices_for_processing('discovered');

    -- 5c. Liberta locks expirados + bump lock_release_count.
    -- 'fetching' volta a 'discovered' para re-pickup. Outros mantêm status.
    UPDATE public.invoices
       SET locked_until = NULL,
           status = 'discovered',
           lock_release_count = lock_release_count + 1
     WHERE locked_until IS NOT NULL
       AND locked_until < now() - interval '30 seconds'
       AND status = 'fetching'
       AND lock_release_count < 3;

    UPDATE public.invoices
       SET locked_until = NULL,
           lock_release_count = lock_release_count + 1
     WHERE locked_until IS NOT NULL
       AND locked_until < now() - interval '30 seconds'
       AND status IN ('analyzing','extracted')
       AND lock_release_count < 3;

    UPDATE public.invoices
       SET locked_until = NULL,
           lock_release_count = lock_release_count + 1
     WHERE locked_until IS NOT NULL
       AND locked_until < now() - interval '30 seconds'
       AND status = 'review'
       AND drive_file_id IS NULL
       AND lock_release_count < 3;

    -- Items que esgotaram qualquer budget: terminais.
    UPDATE public.invoices
       SET status = 'failed_permanent',
           last_error = COALESCE(last_error, CASE
             WHEN attempts >= 3 THEN 'attempts_exceeded'
             WHEN lock_release_count >= 3 THEN 'lock_release_count_exceeded'
             ELSE 'unknown'
           END),
           locked_until = NULL
     WHERE deleted_at IS NULL
       AND (
         status IN ('discovered','fetching','analyzing','extracted')
         OR (status = 'review' AND drive_file_id IS NULL)
       )
       AND (attempts >= 3 OR lock_release_count >= 3);

    -- 5d. Marcar sync_jobs 'processing' como 'done' quando tudo terminou.
    UPDATE public.sync_jobs sj
       SET status = 'done',
           completed_at = now()
     WHERE sj.status = 'processing'
       AND NOT EXISTS (
         SELECT 1 FROM public.invoices i
          WHERE i.sync_job_id = sj.id
            AND i.deleted_at IS NULL
            AND (
              i.status IN ('discovered','fetching','analyzing','extracted')
              OR (i.status = 'review' AND i.drive_file_id IS NULL AND i.storage_path IS NOT NULL)
            )
       );

    -- Cancelled: completed_at quando workers acabaram de drenar items.
    UPDATE public.sync_jobs sj
       SET completed_at = COALESCE(sj.completed_at, now())
     WHERE sj.status = 'cancelled'
       AND sj.completed_at IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.invoices i
          WHERE i.sync_job_id = sj.id
            AND i.deleted_at IS NULL
            AND i.status IN ('discovered','fetching','analyzing','extracted')
       );

    -- 5e. Analyze: 5× workers se há pickable.
    SELECT public.trigger_sync_worker('analyze-batch', '{}'::jsonb)
      FROM generate_series(1, 5) AS g(n)
     WHERE public.has_pickable_invoices_for_processing('analyzing');

    -- 5f. Finalize: 5× workers se há pickable.
    SELECT public.trigger_sync_worker('finalize-batch', '{}'::jsonb)
      FROM generate_series(1, 5) AS g(n)
     WHERE public.has_pickable_invoices_for_finalize();
  $cmd$
);
