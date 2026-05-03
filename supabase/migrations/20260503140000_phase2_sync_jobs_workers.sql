-- =============================================================================
-- PLAN_HARDENING.md Fase 2 — Worker discover-emails + cron trigger + watchdog
-- =============================================================================
-- 1. Relaxa invoices.file_url para NULL (stubs 'discovered' criados pelo
--    discover-emails ainda não têm Storage; só são preenchidos no
--    fetch-attachments).
-- 2. Cria helper RPC trigger_sync_worker(p_function, p_body) — encapsula
--    net.http_post para os workers chamarem self-trigger sem ter que conhecer
--    o URL/secret do projecto.
-- 3. Cria função cron_create_nightly_sync_jobs() que materializa 1 sync_job
--    por email_account activa cuja tenant tem emailSync ligado e que não
--    tem job activo. Idempotente — pode correr várias vezes sem efeito
--    (UNIQUE partial index uniq_sync_jobs_active_per_tenant impede duplicados).
-- 4. Agenda cron sync-jobs-cron-trigger (23:58 UTC, diário) que chama #3.
-- 5. Agenda cron sync-jobs-watchdog (1min) que dispara discover-emails para
--    jobs queued/sem heartbeat e fetch-attachments se há discovered livres.
--    Marca jobs como 'done' quando todas as invoices terminaram.
-- 6. Desactiva o sync-email-nightly antigo (mas mantém a função em pé para
--    eventual rollback até a Fase 8 fazer cleanup).
-- =============================================================================

-- 1. file_url nullable -------------------------------------------------------
ALTER TABLE public.invoices ALTER COLUMN file_url DROP NOT NULL;

COMMENT ON COLUMN public.invoices.file_url IS
  'URL signed do anexo em Storage. NULL para stubs ''discovered'' ainda não baixados pelo fetch-attachments.';

-- 2. Helper RPC trigger_sync_worker ------------------------------------------
-- Encapsula net.http_post: workers (Edge Functions) chamam via supabase.rpc
-- sem precisar de conhecer URL nem secret. Mantém URL/secret coerentes com
-- os cron jobs existentes (mesmo padrão hardcoded — gestão de GUC ficaria
-- por fazer e o tradeoff não compensa).
CREATE OR REPLACE FUNCTION public.trigger_sync_worker(
  p_function text,
  p_body jsonb DEFAULT '{}'::jsonb
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request_id bigint;
BEGIN
  IF p_function IS NULL OR p_function NOT IN ('discover-emails','fetch-attachments','analyze-batch','finalize-batch') THEN
    RAISE EXCEPTION 'invalid function: %', p_function USING ERRCODE = '22023';
  END IF;

  SELECT net.http_post(
    url := 'https://sxfwprydmllovnxxjhrh.supabase.co/functions/v1/' || p_function,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '9004fe8b8233e8351ba6c40b1518e78ecf2aee152ef93b6e0855b32128620073'
    ),
    body := p_body,
    timeout_milliseconds := 5000
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.trigger_sync_worker(text, jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_sync_worker(text, jsonb) TO service_role;

COMMENT ON FUNCTION public.trigger_sync_worker(text, jsonb) IS
  'Auto-trigger Edge Function via pg_net (sobrevive à morte do worker que chama). Service role only. Whitelist de funções do pipeline sync_jobs.';

-- 3. Função para criar sync_jobs do cron diário ------------------------------
-- 1 job por email_account activa, evitando tenants com emailSync desligado.
-- O UNIQUE partial index uniq_sync_jobs_active_per_tenant garante que se um
-- job da execução anterior ainda está vivo (raro), não criamos outro.
CREATE OR REPLACE FUNCTION public.cron_create_nightly_sync_jobs()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  WITH inserted AS (
    INSERT INTO public.sync_jobs (
      tenant_id, user_id, email_account_id, trigger,
      gmail_query, status
    )
    SELECT
      ea.tenant_id,
      ea.user_id,
      ea.id,
      'cron'::text,
      'has:attachment (filename:pdf OR filename:jpg OR filename:jpeg OR filename:png) newer_than:7d'::text,
      'queued'::text
    FROM public.email_accounts ea
    JOIN public.tenants t ON t.id = ea.tenant_id
    WHERE ea.is_active = true
      AND t.deleted_at IS NULL
      AND COALESCE((t.onboarding_data->>'emailSync')::text, 'true') <> 'false'
      AND NOT EXISTS (
        SELECT 1 FROM public.sync_jobs sj
        WHERE sj.tenant_id = ea.tenant_id
          AND sj.status IN ('queued','discovering','processing','paused_reauth')
      )
    RETURNING id
  )
  SELECT count(*)::int INTO v_count FROM inserted;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.cron_create_nightly_sync_jobs() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cron_create_nightly_sync_jobs() TO service_role;

COMMENT ON FUNCTION public.cron_create_nightly_sync_jobs() IS
  'Materializa sync_jobs diários (trigger=cron) para email_accounts activas. Idempotente.';

-- 4. Cron sync-jobs-cron-trigger (23:58 UTC) ---------------------------------
-- Substitui sync-email-nightly. Mantemos o mesmo horário para que o
-- comportamento perceptível (sync ao final do dia) não mude.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='sync-jobs-cron-trigger') THEN
    PERFORM cron.unschedule('sync-jobs-cron-trigger');
  END IF;
END $$;

SELECT cron.schedule(
  'sync-jobs-cron-trigger',
  '58 23 * * *',
  $cmd$ SELECT public.cron_create_nightly_sync_jobs(); $cmd$
);

-- 5. Cron sync-jobs-watchdog (1 minuto) --------------------------------------
-- Idempotente: se workers já estão a correr, SKIP LOCKED no fetch evita
-- duplicação. discover-emails faz check de heartbeat < 60s para skip.
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
    -- com heartbeat parado >90s (presume worker morto). last_heartbeat_at
    -- é actualizado pelo trigger trg_sync_jobs_heartbeat em cada UPDATE.
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

    -- 5b. Fetch: dispara fetch-attachments se há discovered livres. Single
    -- shot — o próprio worker self-triggera enquanto há trabalho.
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
    -- Items 'fetching' presos voltam a 'discovered' para fetch-attachments
    -- pickar de novo. Items 'analyzing'/'extracted' mantêm o estado (são
    -- itens dos workers das Fases 4-5; só limpamos o lock).
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

    -- Items que esgotaram retries: marcar terminais para sair do worker pool.
    UPDATE public.invoices
       SET status = 'failed_permanent',
           last_error = COALESCE(last_error, 'attempts_exceeded'),
           locked_until = NULL
     WHERE status IN ('discovered','fetching')
       AND attempts >= 3
       AND deleted_at IS NULL;

    -- 5d. Marcar sync_jobs como 'done' quando todas as invoices terminaram.
    -- Items terminais: completed/rejected/duplicate/failed_permanent/inbox/review.
    -- Items activos: discovered/fetching/analyzing/extracted.
    UPDATE public.sync_jobs sj
       SET status = 'done',
           completed_at = now()
     WHERE sj.status = 'processing'
       AND NOT EXISTS (
         SELECT 1 FROM public.invoices i
         WHERE i.sync_job_id = sj.id
           AND i.status IN ('discovered','fetching','analyzing','extracted')
           AND i.deleted_at IS NULL
       );
  $cmd$
);

-- 6. Desactiva sync-email-nightly antigo --------------------------------------
-- Edge function sync-email mantém-se em pé (rollback rápido se necessário —
-- ver §10.3 do PLAN_HARDENING). Cleanup definitivo só na Fase 8.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='sync-email-nightly') THEN
    PERFORM cron.unschedule('sync-email-nightly');
  END IF;
END $$;
