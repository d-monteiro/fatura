-- =============================================================================
-- PLAN_HARDENING.md Fases 4 + 5 — Workers analyze-batch + finalize-batch
-- =============================================================================
-- 1. RPC pick_invoices_for_finalize: pickup com SKIP LOCKED para invoices
--    com Gemini concluído mas sem Drive (status='extracted' ou 'review' com
--    drive_file_id NULL e storage_path setado). Espelha pick_invoices_for_processing
--    mas não filtra por status único (precisamos cobrir 2).
-- 2. Watchdog cron sync-jobs-watchdog estendido com etapas 5e (analyze-batch
--    5×/min) e 5f (finalize-batch 5×/min). Liberação de locks expirados em
--    'extracted' e 'review-com-drive-null'. Marcar attempts>=3 em
--    'analyzing'/'extracted' como failed_permanent.
-- 3. Condição "done" do sync_job actualizada: invoices em 'review' sem
--    drive_file_id contam como activas (ainda precisam de finalize-batch).
-- =============================================================================

-- 1. RPC pick_invoices_for_finalize ------------------------------------------
-- Pega invoices com Gemini concluído (status='extracted' ou 'review') e que
-- ainda não foram para Drive (drive_file_id IS NULL). Lock optimista evita
-- race com reprocess-pending (cron 15min legacy) e self-trigger duplicado.
-- attempts < 3 isola items que falharam permanentemente em finalize.
CREATE OR REPLACE FUNCTION public.pick_invoices_for_finalize(
  p_limit int DEFAULT 5,
  p_lock_seconds int DEFAULT 180
)
RETURNS SETOF public.invoices
LANGUAGE sql
SECURITY DEFINER
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
  'Worker pickup para finalize-batch: invoices Gemini-OK sem Drive ainda. SKIP LOCKED + lock optimista. Cobre extracted (Gemini ok) e review (Gemini sinalizou revisão humana mas Drive ainda não correu). Service role only.';

-- 2. Whitelist da função trigger_sync_worker já inclui analyze-batch e
--    finalize-batch (definida na Fase 2). Não é preciso alterar.

-- 3. Watchdog cron sync-jobs-watchdog estendido -------------------------------
-- Substitui o do migration phase2. Mantém 5a-5d e adiciona 5e (analyze-batch),
-- 5f (finalize-batch), além de actualizar 5c (limpar locks 'extracted') e 5d
-- (incluir 'review-com-drive-null' como activos para fechar correctamente).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='sync-jobs-watchdog') THEN
    PERFORM cron.unschedule('sync-jobs-watchdog');
  END IF;
END $$;

SELECT cron.schedule(
  'sync-jobs-watchdog',
  '* * * * *',
  $cmd$
    -- 5a. Discover: dispara discover-emails para jobs queued OU discovering
    -- com heartbeat parado >90s (presume worker morto).
    SELECT net.http_post(
      url := 'https://sxfwprydmllovnxxjhrh.supabase.co/functions/v1/discover-emails',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-cron-secret','9004fe8b8233e8351ba6c40b1518e78ecf2aee152ef93b6e0855b32128620073'
      ),
      body := jsonb_build_object('sync_job_id', sj.id),
      timeout_milliseconds := 5000
    )
    FROM public.sync_jobs sj
    WHERE sj.status IN ('queued','discovering')
      AND sj.last_heartbeat_at < now() - interval '90 seconds';

    -- 5b. Fetch: dispara fetch-attachments se há discovered livres.
    SELECT net.http_post(
      url := 'https://sxfwprydmllovnxxjhrh.supabase.co/functions/v1/fetch-attachments',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-cron-secret','9004fe8b8233e8351ba6c40b1518e78ecf2aee152ef93b6e0855b32128620073'
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 5000
    )
    WHERE EXISTS (
      SELECT 1 FROM public.invoices
      WHERE status = 'discovered'
        AND deleted_at IS NULL
        AND (locked_until IS NULL OR locked_until < now())
        AND attempts < 3
      LIMIT 1
    );

    -- 5c. Liberta locks expirados (worker morreu mid-batch sem release).
    -- 'fetching': volta para 'discovered'. Pickup do fetch-attachments retoma.
    -- 'analyzing'/'extracted': mantém status, só limpa lock.
    UPDATE public.invoices
       SET locked_until = NULL,
           status = 'discovered'
     WHERE locked_until IS NOT NULL
       AND locked_until < now() - interval '30 seconds'
       AND status = 'fetching'
       AND attempts < 3;

    UPDATE public.invoices
       SET locked_until = NULL
     WHERE locked_until IS NOT NULL
       AND locked_until < now() - interval '30 seconds'
       AND status IN ('analyzing','extracted');

    -- review com lock expirado: largar lock, mantém status para finalize-batch
    -- voltar a pickar (filtro do RPC pick_invoices_for_finalize trata o resto).
    UPDATE public.invoices
       SET locked_until = NULL
     WHERE locked_until IS NOT NULL
       AND locked_until < now() - interval '30 seconds'
       AND status = 'review'
       AND drive_file_id IS NULL
       AND attempts < 3;

    -- Items que esgotaram retries em qualquer fase activa: marcar terminais.
    UPDATE public.invoices
       SET status = 'failed_permanent',
           last_error = COALESCE(last_error, 'attempts_exceeded'),
           locked_until = NULL
     WHERE status IN ('discovered','fetching','analyzing','extracted')
       AND attempts >= 3
       AND deleted_at IS NULL;

    -- 5d. Marcar sync_jobs como 'done' quando todas as invoices terminaram.
    -- Items activos: discovered/fetching/analyzing/extracted + review-com-Drive-null.
    -- Items terminais: failed/failed_permanent/inbox/duplicate/cancelled OU
    --                  review-com-Drive-setado (revisão humana após Drive ok).
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
             OR (
               i.status = 'review'
               AND i.drive_file_id IS NULL
               AND i.storage_path IS NOT NULL
             )
           )
       );

    -- 5e. Analyze: dispara 5× analyze-batch se há analyzing livres.
    -- generate_series(1,5) + SKIP LOCKED no pickup garante 5 workers
    -- paralelos a drenar o queue. Self-trigger interno mantém workers
    -- vivos enquanto há trabalho — o cron 5×/min é apenas seed.
    SELECT net.http_post(
      url := 'https://sxfwprydmllovnxxjhrh.supabase.co/functions/v1/analyze-batch',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-cron-secret','9004fe8b8233e8351ba6c40b1518e78ecf2aee152ef93b6e0855b32128620073'
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 5000
    )
    FROM generate_series(1, 5) AS g(n)
    WHERE EXISTS (
      SELECT 1 FROM public.invoices
      WHERE status = 'analyzing'
        AND deleted_at IS NULL
        AND (locked_until IS NULL OR locked_until < now())
        AND (next_retry_at IS NULL OR next_retry_at < now())
        AND attempts < 3
      LIMIT 1
    );

    -- 5f. Finalize: dispara 5× finalize-batch se há extracted/review-sem-Drive.
    -- Margem larga vs. limite Drive (100/min): 5 workers × 1 finalize/15-25s
    -- ≈ 15/min agregado.
    SELECT net.http_post(
      url := 'https://sxfwprydmllovnxxjhrh.supabase.co/functions/v1/finalize-batch',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-cron-secret','9004fe8b8233e8351ba6c40b1518e78ecf2aee152ef93b6e0855b32128620073'
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 5000
    )
    FROM generate_series(1, 5) AS g(n)
    WHERE EXISTS (
      SELECT 1 FROM public.invoices
      WHERE status IN ('extracted','review')
        AND deleted_at IS NULL
        AND drive_file_id IS NULL
        AND storage_path IS NOT NULL
        AND (locked_until IS NULL OR locked_until < now())
        AND (next_retry_at IS NULL OR next_retry_at < now())
        AND attempts < 3
      LIMIT 1
    );
  $cmd$
);

-- 4. Comentários documentais --------------------------------------------------
COMMENT ON FUNCTION public.pick_invoices_for_finalize(int, int) IS
  'Worker pickup para finalize-batch (Fase 5). Pega invoices Gemini-OK sem Drive (status extracted ou review com drive_file_id NULL). Lock optimista evita race com reprocess-pending legacy.';
