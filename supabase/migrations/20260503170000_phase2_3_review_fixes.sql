-- =============================================================================
-- PLAN_HARDENING.md Fases 2 + 3 — Review fixes (post code review)
-- =============================================================================
-- Resolve 4 críticos + 9 sérios + nits ao deployment das fases 2/3 (commit
-- d35a0f1) e à migration 20260503140000_phase2_sync_jobs_workers.sql + à de
-- review da fase 4/5 (20260503160000) que chegou também sem resolver C1.
--
-- Críticos:
--   C1 — Trigger reset zera locked_until e item fica preso em status='fetching'
--        para sempre se worker morre (watchdog 5c precisa locked_until IS NOT
--        NULL e nunca dispara). Fix: trigger NÃO toca em locked_until — passa
--        a ser controlo 100% do worker. Cláusula extra do watchdog recupera
--        items 'fetching' órfãos (locked_until IS NULL) que existam pré-fix.
--   C2 — Workers nunca bumpavam attempts em falha logical → infinite retry.
--        Fix: bump_invoice_attempt RPC criada em 20260503160000; workers
--        passam a chamá-la. Trigger reset bucket-aware: só zera attempts
--        quando o status muda de bucket distinto (discovery → analyze →
--        finalize → terminal), não em transições internas.
--   C3 — CRON_SECRET hardcoded em 2 migrations (20260503140000, 150000) ficou
--        em git history. Fix: trigger_sync_worker e cron sync-jobs-watchdog
--        passam a ler 'app.sync_worker_secret' via current_setting().
--        Operacional: rodar secret no Supabase Dashboard de cada Edge Function
--        do pipeline e setar GUC ANTES de aplicar esta migration:
--           ALTER DATABASE postgres SET app.sync_worker_secret = '<novo>';
--           SELECT pg_reload_conf();
--   C4 — invoices_email_unique sem NULLS NOT DISTINCT permite stubs (NULL em
--        email_attachment_id) duplicados em race. Fix: drop+recreate com
--        NULLS NOT DISTINCT (Postgres 15+).
--
-- Sérios:
--   S1 — discover-emails pseudo-lock racy. Fix: RPC sync_job_acquire_discover_lock
--        com UPDATE atómico; worker substitui SELECT-then-update.
--   S2 — markCancelled lógico nos workers (não SQL). Trigger reset trata
--        terminação ('cancelled' não é discovery/analyze/finalize bucket).
--   S3 — paused_reauth sem caminho de retomar. Fix: trigger AFTER UPDATE em
--        user_oauth_tokens que requeue jobs paused_reauth quando needs_reauth
--        passa true→false (ou refresh_token muda). Idempotente.
--   S6 — Watchdog 5b dispara só 1 fetch-attachments por tick. Fix:
--        generate_series(1,5) (já existe para analyze/finalize na fase 4/5).
--   S8/S9 — guards de status nos UPDATEs (workers + RLS via .neq("status", ...)).
--   S10 — multi-attachment INSERT propaga sync_run_id (workers).
--   S11 — error mapping 401/403/404/429/5xx (workers).
-- =============================================================================

-- =============================================================================
-- 0. Pre-flight: confirmar que o secret está no Vault (se não, falha cedo)
-- =============================================================================
-- Operacional: o secret é criado uma vez via:
--   SELECT vault.create_secret('<valor>', 'sync_worker_secret', 'descrição');
-- O valor deve coincidir com CRON_SECRET no Dashboard de cada Edge Function
-- do pipeline (discover-emails, fetch-attachments, analyze-batch,
-- finalize-batch, reprocess-pending, send-auto-reports, check-due-dates,
-- drive-folders-dedup, sync-email).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'sync_worker_secret') THEN
    RAISE EXCEPTION
      'Vault secret "sync_worker_secret" não existe. Antes de aplicar:
         SELECT vault.create_secret(''<valor>'', ''sync_worker_secret'', ''CRON_SECRET partilhado'');
       O valor deve coincidir com CRON_SECRET nas Edge Functions do pipeline.';
  END IF;
END $$;

-- =============================================================================
-- 1. C1+S7 — Trigger reset bucket-aware. NÃO toca em locked_until.
-- =============================================================================
-- A versão da fase 1 hardening (e da fase 4/5 review) zerava locked_until
-- em qualquer mudança de status. Isto destruía o lock optimista posto pelo
-- pick_invoices_for_processing assim que o worker fazia UPDATE cosmético
-- status='fetching' — se o worker morresse, items ficavam presos.
--
-- Política nova:
--   - Reset attempts/lock_release_count/next_retry_at apenas em transição
--     entre buckets distintos (discovery → analyze → finalize → terminal).
--   - locked_until é controlo 100% do worker; nunca tocado pelo trigger.
--   - Buckets:
--       discovery: discovered, fetching
--       analyze:   analyzing
--       finalize:  extracted
--       terminal:  completed, rejected, duplicate, failed_permanent,
--                  cancelled, review (estado terminal user-facing)
--       legacy:    inbox, failed (mantidos por compat)
CREATE OR REPLACE FUNCTION public.invoices_reset_attempts_on_status_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  old_bucket text;
  new_bucket text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  old_bucket := CASE OLD.status
    WHEN 'discovered' THEN 'discovery'
    WHEN 'fetching'   THEN 'discovery'
    WHEN 'analyzing'  THEN 'analyze'
    WHEN 'extracted'  THEN 'finalize'
    WHEN 'completed' THEN 'terminal'
    WHEN 'rejected'  THEN 'terminal'
    WHEN 'duplicate' THEN 'terminal'
    WHEN 'failed_permanent' THEN 'terminal'
    WHEN 'cancelled' THEN 'terminal'
    WHEN 'review'    THEN 'terminal'
    WHEN 'inbox'     THEN 'terminal'
    WHEN 'failed'    THEN 'terminal'
    ELSE 'other'
  END;

  new_bucket := CASE NEW.status
    WHEN 'discovered' THEN 'discovery'
    WHEN 'fetching'   THEN 'discovery'
    WHEN 'analyzing'  THEN 'analyze'
    WHEN 'extracted'  THEN 'finalize'
    WHEN 'completed' THEN 'terminal'
    WHEN 'rejected'  THEN 'terminal'
    WHEN 'duplicate' THEN 'terminal'
    WHEN 'failed_permanent' THEN 'terminal'
    WHEN 'cancelled' THEN 'terminal'
    WHEN 'review'    THEN 'terminal'
    WHEN 'inbox'     THEN 'terminal'
    WHEN 'failed'    THEN 'terminal'
    ELSE 'other'
  END;

  -- Transição entre buckets: novo budget de retry. locked_until intocável.
  IF old_bucket IS DISTINCT FROM new_bucket THEN
    NEW.attempts := 0;
    NEW.lock_release_count := 0;
    NEW.next_retry_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.invoices_reset_attempts_on_status_change() IS
  'Reset bucket-aware: zera attempts/lock_release_count/next_retry_at apenas em transição entre buckets de processamento (discovery/analyze/finalize/terminal). Nunca toca em locked_until — controlo 100% do worker via release explícito ou expiração natural.';

-- =============================================================================
-- 2. C3 — trigger_sync_worker lê GUC; sem hardcoded secret
-- =============================================================================
DROP FUNCTION IF EXISTS public.trigger_sync_worker(text, jsonb);

CREATE FUNCTION public.trigger_sync_worker(
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
  v_secret text;
  v_url text;
BEGIN
  IF p_function IS NULL OR p_function NOT IN ('discover-emails','fetch-attachments','analyze-batch','finalize-batch') THEN
    RAISE EXCEPTION 'invalid function: %', p_function USING ERRCODE = '22023';
  END IF;

  SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets
   WHERE name = 'sync_worker_secret'
   LIMIT 1;
  IF v_secret IS NULL OR v_secret = '' THEN
    RAISE EXCEPTION 'Vault secret sync_worker_secret não encontrado' USING ERRCODE = '22000';
  END IF;

  v_url := 'https://sxfwprydmllovnxxjhrh.supabase.co/functions/v1/' || p_function;

  SELECT net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', v_secret
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
  'Auto-trigger Edge Function via pg_net. Lê secret de vault.decrypted_secrets WHERE name=sync_worker_secret (sem hardcoded em git). Service role only. Whitelist de funções do pipeline sync_jobs.';

-- =============================================================================
-- 3. C4 — invoices_email_unique NULLS NOT DISTINCT
-- =============================================================================
-- Stubs criados pelo discover-emails têm email_attachment_id=NULL. Em PG <15
-- ou sem NULLS NOT DISTINCT, dois stubs com (tenant_X, msg_M, NULL) NÃO são
-- considerados duplicados — race em concurrent runs cria duplicados.
DROP INDEX IF EXISTS public.invoices_email_unique;

CREATE UNIQUE INDEX invoices_email_unique
  ON public.invoices (tenant_id, email_message_id, email_attachment_id) NULLS NOT DISTINCT
  WHERE email_message_id IS NOT NULL;

COMMENT ON INDEX public.invoices_email_unique IS
  'Unique partial: cada (tenant, message_id, attachment_id) entra uma vez. NULLS NOT DISTINCT trata 2 stubs com attachment_id=NULL (criados por discover-emails) como duplicados — protege contra race entre watchdog e self-trigger.';

-- =============================================================================
-- 4. S1 — RPC sync_job_acquire_discover_lock (UPDATE atómico)
-- =============================================================================
-- Substitui o pseudo-lock racy do discover-emails (linha 92-110: SELECT
-- last_heartbeat_at + UPDATE separado). UPDATE atómico com WHERE em
-- last_heartbeat_at < now()-60s OR status='queued' garante que apenas um
-- worker concorrente passa.
CREATE OR REPLACE FUNCTION public.sync_job_acquire_discover_lock(
  p_job_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  UPDATE public.sync_jobs
     SET status = CASE WHEN status = 'queued' THEN 'discovering' ELSE status END,
         last_heartbeat_at = clock_timestamp(),
         started_at = COALESCE(started_at, now())
   WHERE id = p_job_id
     AND status IN ('queued','discovering')
     AND (status = 'queued' OR last_heartbeat_at < now() - interval '60 seconds')
  RETURNING id INTO v_id;

  RETURN v_id IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_job_acquire_discover_lock(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_job_acquire_discover_lock(uuid) TO service_role;

COMMENT ON FUNCTION public.sync_job_acquire_discover_lock(uuid) IS
  'Lock atómico para discover-emails: UPDATE com WHERE em status+heartbeat (clock_timestamp para avançar dentro da transação). Retorna true se este worker tem o lock, false se outro tem heartbeat fresco. Substitui SELECT-then-update racy.';

-- =============================================================================
-- 5. S3 — Trigger user_oauth_tokens: resume jobs paused_reauth após re-auth
-- =============================================================================
-- Quando o user faz OAuth callback e o token volta a ser válido (needs_reauth
-- passa true→false ou refresh_token muda), os sync_jobs em 'paused_reauth'
-- ligados a este token devem ser re-queued para o cron retomar. Sem isto,
-- ficam órfãos para sempre.
CREATE OR REPLACE FUNCTION public.user_oauth_tokens_resume_paused_jobs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Disparar quando passa de needs_reauth=true → false OU quando refresh_token
  -- muda (re-auth efectivo). Idempotente: WHERE status='paused_reauth'.
  IF (OLD.needs_reauth = true AND COALESCE(NEW.needs_reauth, false) = false)
     OR (OLD.refresh_token IS DISTINCT FROM NEW.refresh_token AND NEW.refresh_token IS NOT NULL) THEN
    UPDATE public.sync_jobs sj
       SET status = 'queued',
           error_message = NULL,
           last_heartbeat_at = clock_timestamp()
     WHERE sj.status = 'paused_reauth'
       AND sj.email_account_id IN (
         SELECT ea.id FROM public.email_accounts ea
         WHERE ea.oauth_token_id = NEW.id
       );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_oauth_tokens_resume ON public.user_oauth_tokens;
CREATE TRIGGER trg_user_oauth_tokens_resume
  AFTER UPDATE OF needs_reauth, refresh_token ON public.user_oauth_tokens
  FOR EACH ROW
  EXECUTE FUNCTION public.user_oauth_tokens_resume_paused_jobs();

COMMENT ON FUNCTION public.user_oauth_tokens_resume_paused_jobs() IS
  'Resume jobs paused_reauth quando o user faz re-auth: needs_reauth true→false OU refresh_token muda. Idempotente (no-op se não há jobs paused). Cobre o caso "sync ficou preso e user fez re-auth via UI" sem precisar de cron extra.';

-- =============================================================================
-- 6. Cleanup: items 'fetching' órfãos pré-fix (locked_until=NULL devido ao bug)
-- =============================================================================
-- Pré-fix do C1, items que entraram em 'fetching' e ficaram com locked_until
-- nullified pelo trigger antigo estão presos. Volta-os para 'discovered' para
-- o pickup retomar. Idempotente: só age em items órfãos.
UPDATE public.invoices
   SET status = 'discovered'
 WHERE status = 'fetching'
   AND locked_until IS NULL
   AND deleted_at IS NULL;

-- =============================================================================
-- 7. S6 + Watchdog refactorado: 5× fetch + recuperação 'fetching' órfão
-- =============================================================================
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
    -- 5a. Discover: jobs sem heartbeat recente (queued ou discovering parado).
    SELECT public.trigger_sync_worker('discover-emails', jsonb_build_object('sync_job_id', sj.id))
      FROM public.sync_jobs sj
     WHERE sj.status IN ('queued','discovering')
       AND sj.last_heartbeat_at < now() - interval '90 seconds';

    -- 5b. Fetch: 5× workers paralelos se há discovered livres (S6).
    SELECT public.trigger_sync_worker('fetch-attachments', '{}'::jsonb)
      FROM generate_series(1, 5) AS g(n)
     WHERE public.has_pickable_invoices_for_processing('discovered');

    -- 5c. Recuperação de 'fetching' órfão (locked_until nullified pelo trigger
    -- antigo, pre-fix C1). Volta a 'discovered'. lock_release_count incrementa
    -- como sinal — se chegar a 3, falha permanent na cláusula seguinte.
    UPDATE public.invoices
       SET status = 'discovered',
           lock_release_count = lock_release_count + 1
     WHERE status = 'fetching'
       AND locked_until IS NULL
       AND deleted_at IS NULL
       AND lock_release_count < 3;

    -- 5c'. Liberta locks expirados em 'discovered' (worker fetch-attachments
    -- mantém status='discovered' enquanto tem o lock — não há mais transição
    -- cosmética para 'fetching'). Se worker morreu, lock expira em 90s e
    -- aqui é libertado para próximo pickup.
    UPDATE public.invoices
       SET locked_until = NULL,
           lock_release_count = lock_release_count + 1
     WHERE locked_until IS NOT NULL
       AND locked_until < now() - interval '30 seconds'
       AND status = 'discovered'
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
             ELSE 'budget_exceeded'
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

COMMENT ON FUNCTION public.sync_job_acquire_discover_lock(uuid) IS
  'Lock atómico para discover-emails. Substitui SELECT-then-UPDATE racy. UPDATE com WHERE em status+heartbeat. Retorna true se este worker pode prosseguir.';
