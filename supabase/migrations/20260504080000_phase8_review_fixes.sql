-- PLAN_HARDENING Fase 8 — review fixes (commit Codex GPT-5.5).
--
-- B2: circuit breaker per-tenant (PK era só `service` — 1 falha num tenant pausa todos).
-- B3: record_success só fecha em half_open (race fechava cooldown a meio).
-- B5: tabela sync_monitor_alert_log + RPC dedup (sem isto Slack inunda 6 msg/h em job preso).
-- S1: watchdog respeita breaker (não dispara workers durante cooldown).
-- S3+S4+S5: monitor_check apanha paused_reauth, filtra sync_job_id, usa failed_permanent_at.
-- S7: GUC app.functions_base_url (deixa de hardcodar project ref).
-- N2: drop policy cb_admin_read inútil (admins acedem via RPC, não direct).
-- N5: limpa trip_count=1/last_failure_reason='smoke_test_429' do gemini (resíduo do smoke).

-- ─────────────────────────────────────────────────────────────────────────
-- 0. URL via Vault (em vez de hardcoded). Fallback explícito para staging/branches.
-- ─────────────────────────────────────────────────────────────────────────
-- Para suportar futuras branches Supabase (staging, dev), o URL base passa a ser
-- lido de Vault `functions_base_url`. Se não existir, usa GUC `app.functions_base_url`
-- (settable via dashboard). Se nenhum existir, fallback para o ref de produção.
-- Operacional: criar secret no dashboard com nome `functions_base_url` e valor
-- `https://<ref>.supabase.co/functions/v1` em cada ambiente.

CREATE OR REPLACE FUNCTION public.trigger_sync_worker(p_function text, p_body jsonb DEFAULT '{}'::jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_request_id bigint;
  v_secret text;
  v_base_url text;
BEGIN
  IF p_function IS NULL OR p_function NOT IN ('discover-emails','fetch-attachments','analyze-batch','finalize-batch') THEN
    RAISE EXCEPTION 'invalid function: %', p_function USING ERRCODE = '22023';
  END IF;

  SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets WHERE name = 'sync_worker_secret' LIMIT 1;
  IF v_secret IS NULL OR v_secret = '' THEN
    RAISE EXCEPTION 'Vault secret sync_worker_secret não encontrado' USING ERRCODE = '22000';
  END IF;

  SELECT decrypted_secret INTO v_base_url
    FROM vault.decrypted_secrets WHERE name = 'functions_base_url' LIMIT 1;
  IF v_base_url IS NULL OR v_base_url = '' THEN
    v_base_url := current_setting('app.functions_base_url', true);
  END IF;
  IF v_base_url IS NULL OR v_base_url = '' THEN
    v_base_url := 'https://sxfwprydmllovnxxjhrh.supabase.co/functions/v1';
  END IF;

  SELECT net.http_post(
    url := v_base_url || '/' || p_function,
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

CREATE OR REPLACE FUNCTION public.trigger_sync_monitor()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_request_id bigint;
  v_secret text;
  v_base_url text;
BEGIN
  SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets WHERE name = 'sync_worker_secret' LIMIT 1;
  IF v_secret IS NULL OR v_secret = '' THEN
    RAISE EXCEPTION 'Vault secret sync_worker_secret não encontrado' USING ERRCODE = '22000';
  END IF;

  SELECT decrypted_secret INTO v_base_url
    FROM vault.decrypted_secrets WHERE name = 'functions_base_url' LIMIT 1;
  IF v_base_url IS NULL OR v_base_url = '' THEN
    v_base_url := current_setting('app.functions_base_url', true);
  END IF;
  IF v_base_url IS NULL OR v_base_url = '' THEN
    v_base_url := 'https://sxfwprydmllovnxxjhrh.supabase.co/functions/v1';
  END IF;

  SELECT net.http_post(
    url := v_base_url || '/sync-monitor',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', v_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 8000
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.trigger_sync_worker(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trigger_sync_monitor() FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. B2 — circuit_breakers per-tenant
-- ─────────────────────────────────────────────────────────────────────────

-- Drop policy obsoleta (N2): admins acedem via RPC, não SELECT direto.
DROP POLICY IF EXISTS cb_admin_read ON public.circuit_breakers;

-- Mudar de PK natural (service) para surrogate (id) + UNIQUE (service,tenant_id)
-- com NULLS NOT DISTINCT. tenant_id NULL = breaker global (caso 429 afecta todos).
ALTER TABLE public.circuit_breakers DROP CONSTRAINT IF EXISTS circuit_breakers_pkey;
ALTER TABLE public.circuit_breakers ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE public.circuit_breakers ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.circuit_breakers ADD CONSTRAINT circuit_breakers_pkey PRIMARY KEY (id);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_circuit_breakers_service_tenant
  ON public.circuit_breakers (service, tenant_id) NULLS NOT DISTINCT;

CREATE INDEX IF NOT EXISTS idx_circuit_breakers_open
  ON public.circuit_breakers (service, tenant_id, expires_at)
  WHERE state = 'open';

-- N5: limpar smoke test do gemini (global)
UPDATE public.circuit_breakers
   SET trip_count = 0, last_failure_reason = NULL, last_tripped_at = NULL
 WHERE service = 'gemini' AND tenant_id IS NULL;

-- circuit_breaker_check: TRUE se nem global nem o per-tenant estão open. Auto
-- transição open→half_open quando expires_at passou. Sem FOR UPDATE no caminho
-- comum (estado=closed) — só pega lock se há open vencido a transitar.
CREATE OR REPLACE FUNCTION public.circuit_breaker_check(
  p_service text,
  p_tenant_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_global_open boolean;
  v_tenant_open boolean;
  v_expired_id uuid;
BEGIN
  -- 1. Promote open→half_open em qualquer row vencida do (service, p_tenant_id|null).
  --    Só pega lock se realmente há row vencida a transitar — o filtro WHERE
  --    aproveita idx_circuit_breakers_open.
  FOR v_expired_id IN
    SELECT id FROM public.circuit_breakers
     WHERE service = p_service
       AND (tenant_id IS NULL OR tenant_id = p_tenant_id)
       AND state = 'open'
       AND expires_at IS NOT NULL
       AND expires_at < now()
     FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.circuit_breakers
       SET state = 'half_open', failure_count = 0, failure_window_start = NULL, updated_at = now()
     WHERE id = v_expired_id;
  END LOOP;

  -- 2. Existe global aberto?
  SELECT EXISTS (
    SELECT 1 FROM public.circuit_breakers
     WHERE service = p_service AND tenant_id IS NULL
       AND state = 'open' AND expires_at > now()
  ) INTO v_global_open;

  IF v_global_open THEN
    RETURN false;
  END IF;

  -- 3. Existe per-tenant aberto?
  IF p_tenant_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.circuit_breakers
       WHERE service = p_service AND tenant_id = p_tenant_id
         AND state = 'open' AND expires_at > now()
    ) INTO v_tenant_open;
    IF v_tenant_open THEN
      RETURN false;
    END IF;
  END IF;

  RETURN true;
END;
$$;

-- circuit_breaker_record_failure: auto-cria row se não existir; trip se threshold atingido
-- na window. p_tenant_id=NULL → afecta breaker global (use para 429 que é rate-limit
-- partilhado da API). Para 5xx específicos (auth, permissão) passar tenant_id real.
CREATE OR REPLACE FUNCTION public.circuit_breaker_record_failure(
  p_service text,
  p_tenant_id uuid DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  cb RECORD;
  v_window_start timestamptz;
  v_count int;
BEGIN
  -- Auto-create no primeiro hit. NULLS NOT DISTINCT no UNIQUE INDEX trata
  -- (service, NULL) como uma única linha possível, evitando dups.
  INSERT INTO public.circuit_breakers (service, tenant_id)
       VALUES (p_service, p_tenant_id)
  ON CONFLICT (service, tenant_id) DO NOTHING;

  SELECT * INTO cb FROM public.circuit_breakers
   WHERE service = p_service AND tenant_id IS NOT DISTINCT FROM p_tenant_id
   FOR UPDATE;

  IF cb.failure_window_start IS NULL OR
     cb.failure_window_start < now() - make_interval(secs => cb.threshold_window_seconds) THEN
    v_window_start := now();
    v_count := 1;
  ELSE
    v_window_start := cb.failure_window_start;
    v_count := cb.failure_count + 1;
  END IF;

  IF v_count >= cb.threshold_failures AND cb.state <> 'open' THEN
    UPDATE public.circuit_breakers
       SET state = 'open',
           failure_count = v_count,
           failure_window_start = v_window_start,
           opened_at = now(),
           expires_at = now() + make_interval(secs => cb.cooldown_seconds),
           last_failure_reason = left(coalesce(p_reason, ''), 200),
           trip_count = cb.trip_count + 1,
           last_tripped_at = now(),
           updated_at = now()
     WHERE id = cb.id
     RETURNING * INTO cb;
  ELSE
    UPDATE public.circuit_breakers
       SET failure_count = v_count,
           failure_window_start = v_window_start,
           last_failure_reason = left(coalesce(p_reason, ''), 200),
           updated_at = now()
     WHERE id = cb.id
     RETURNING * INTO cb;
  END IF;

  RETURN to_jsonb(cb);
END;
$$;

-- B3: success só fecha em half_open. Em open continua em cooldown até
-- circuit_breaker_check transitar via expires_at. Caller deve chamar
-- recordSuccess uma vez por batch (não por item) — ver S6 nos workers.
CREATE OR REPLACE FUNCTION public.circuit_breaker_record_success(
  p_service text,
  p_tenant_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  UPDATE public.circuit_breakers
     SET state = 'closed',
         failure_count = 0,
         failure_window_start = NULL,
         opened_at = NULL,
         expires_at = NULL,
         updated_at = now()
   WHERE service = p_service
     AND tenant_id IS NOT DISTINCT FROM p_tenant_id
     AND state = 'half_open';
END;
$$;

-- Drop signatures antigas (1 e 2 args) e re-grant nas novas.
DROP FUNCTION IF EXISTS public.circuit_breaker_record_failure(text, text);
REVOKE ALL ON FUNCTION public.circuit_breaker_check(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.circuit_breaker_record_failure(text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.circuit_breaker_record_success(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.circuit_breaker_check(text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.circuit_breaker_record_failure(text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.circuit_breaker_record_success(text, uuid) TO service_role;

-- Não criar wrapper 1-arg `circuit_breaker_check(text)`: a 2-arg com DEFAULT
-- cobre callers que passam só p_service (PostgREST e plpgsql resolvem para a
-- 2-arg com tenant_id=NULL). Manter as duas causa ambiguidade
-- "function is not unique" em chamadas SQL do dia-a-dia.

-- ─────────────────────────────────────────────────────────────────────────
-- 2. S5 — coluna failed_permanent_at + trigger
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS failed_permanent_at timestamptz;

UPDATE public.invoices
   SET failed_permanent_at = updated_at
 WHERE status = 'failed_permanent' AND failed_permanent_at IS NULL;

CREATE OR REPLACE FUNCTION public.invoices_set_failed_permanent_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status = 'failed_permanent'
     AND (OLD.status IS DISTINCT FROM 'failed_permanent') THEN
    NEW.failed_permanent_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoices_failed_permanent_at ON public.invoices;
CREATE TRIGGER trg_invoices_failed_permanent_at
  BEFORE UPDATE OF status ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.invoices_set_failed_permanent_at();

-- ─────────────────────────────────────────────────────────────────────────
-- 3. B5 — sync_monitor_alert_log + RPC dedup
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sync_monitor_alert_log (
  signature text PRIMARY KEY,
  last_sent_at timestamptz NOT NULL DEFAULT now(),
  send_count int NOT NULL DEFAULT 1,
  payload jsonb
);

ALTER TABLE public.sync_monitor_alert_log ENABLE ROW LEVEL SECURITY;
-- Sem policies — só service_role acede (workers + monitor).

-- Devolve TRUE e regista se o alerta deve ser enviado (>30min desde último).
-- Chamado pelo sync-monitor para cada alerta antes de POST Slack.
CREATE OR REPLACE FUNCTION public.sync_monitor_alert_should_send(
  p_signature text,
  p_payload jsonb DEFAULT NULL,
  p_min_interval_minutes int DEFAULT 30
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_last timestamptz;
  v_should boolean;
BEGIN
  SELECT last_sent_at INTO v_last
    FROM public.sync_monitor_alert_log
   WHERE signature = p_signature
   FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.sync_monitor_alert_log (signature, last_sent_at, send_count, payload)
         VALUES (p_signature, now(), 1, p_payload);
    RETURN true;
  END IF;

  v_should := v_last < now() - make_interval(mins => p_min_interval_minutes);
  IF v_should THEN
    UPDATE public.sync_monitor_alert_log
       SET last_sent_at = now(),
           send_count = send_count + 1,
           payload = p_payload
     WHERE signature = p_signature;
  END IF;
  RETURN v_should;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_monitor_alert_should_send(text, jsonb, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_monitor_alert_should_send(text, jsonb, int) TO service_role;

-- Cleanup periódico (mantém só último 30 dias) — o monitor faz isto inline,
-- não precisa cron próprio.
CREATE OR REPLACE FUNCTION public.sync_monitor_alert_log_cleanup()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  DELETE FROM public.sync_monitor_alert_log
   WHERE last_sent_at < now() - interval '30 days';
$$;

REVOKE ALL ON FUNCTION public.sync_monitor_alert_log_cleanup() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_monitor_alert_log_cleanup() TO service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. S3+S4+S5 — sync_jobs_monitor_check rewrite
-- ─────────────────────────────────────────────────────────────────────────
-- Mudanças vs versão anterior:
--   • paused_reauth >48h conta como stuck (antes só queued/discovering/processing).
--   • error_rate filtra sync_job_id IS NOT NULL (era global, contava uploads manuais).
--   • failed_permanent_spike usa failed_permanent_at (era updated_at, sensível a edits).
--   • severity de stuck distingue paused_reauth (medium) vs activos (high).

CREATE OR REPLACE FUNCTION public.sync_jobs_monitor_check()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_alerts jsonb := '[]'::jsonb;
  v_stuck_active int;
  v_stuck_active_list jsonb;
  v_stuck_reauth int;
  v_stuck_reauth_list jsonb;
  v_recent_total int;
  v_recent_failed int;
  v_error_rate numeric;
  v_backlog int;
  v_breakers_open int;
  v_breakers_open_list jsonb;
  v_failed_perm_recent int;
BEGIN
  -- 1a. Jobs activos (queued/discovering/processing) sem heartbeat há mais de 1h
  WITH stuck AS (
    SELECT id, tenant_id, status, last_heartbeat_at,
           EXTRACT(EPOCH FROM (now() - last_heartbeat_at))::int AS stale_seconds
      FROM public.sync_jobs
     WHERE status IN ('queued','discovering','processing')
       AND last_heartbeat_at < now() - interval '1 hour'
     ORDER BY last_heartbeat_at
     LIMIT 10
  )
  SELECT count(*), coalesce(jsonb_agg(to_jsonb(stuck.*)), '[]'::jsonb)
    INTO v_stuck_active, v_stuck_active_list FROM stuck;

  IF v_stuck_active > 0 THEN
    v_alerts := v_alerts || jsonb_build_array(jsonb_build_object(
      'type', 'stuck_jobs',
      'severity', 'high',
      'count', v_stuck_active,
      'jobs', v_stuck_active_list
    ));
  END IF;

  -- 1b. Jobs em paused_reauth há >48h (user esqueceu re-auth Google)
  WITH stuck AS (
    SELECT id, tenant_id, status, started_at,
           EXTRACT(EPOCH FROM (now() - started_at))::int AS pending_seconds
      FROM public.sync_jobs
     WHERE status = 'paused_reauth'
       AND started_at < now() - interval '48 hours'
     ORDER BY started_at
     LIMIT 10
  )
  SELECT count(*), coalesce(jsonb_agg(to_jsonb(stuck.*)), '[]'::jsonb)
    INTO v_stuck_reauth, v_stuck_reauth_list FROM stuck;

  IF v_stuck_reauth > 0 THEN
    v_alerts := v_alerts || jsonb_build_array(jsonb_build_object(
      'type', 'paused_reauth_stale',
      'severity', 'medium',
      'count', v_stuck_reauth,
      'jobs', v_stuck_reauth_list
    ));
  END IF;

  -- 2. Error rate >20% nos últimos 100 items terminais do PIPELINE SYNC (24h).
  --    sync_job_id NOT NULL exclui uploads manuais.
  SELECT count(*), count(*) FILTER (WHERE status='failed_permanent')
    INTO v_recent_total, v_recent_failed
    FROM (
      SELECT status FROM public.invoices
       WHERE sync_job_id IS NOT NULL
         AND status IN ('failed_permanent','completed','inbox','rejected')
         AND created_at > now() - interval '24 hours'
       ORDER BY created_at DESC
       LIMIT 100
    ) recent;

  IF v_recent_total >= 20 THEN
    v_error_rate := v_recent_failed::numeric / v_recent_total;
    IF v_error_rate > 0.20 THEN
      v_alerts := v_alerts || jsonb_build_array(jsonb_build_object(
        'type', 'error_rate',
        'severity', 'high',
        'rate', round(v_error_rate, 3),
        'sample_size', v_recent_total,
        'failed_count', v_recent_failed
      ));
    END IF;
  END IF;

  -- 3. Backlog acumulado: >1000 invoices em analyzing
  SELECT count(*) INTO v_backlog
    FROM public.invoices
   WHERE status='analyzing' AND deleted_at IS NULL;

  IF v_backlog > 1000 THEN
    v_alerts := v_alerts || jsonb_build_array(jsonb_build_object(
      'type', 'backlog',
      'severity', 'medium',
      'analyzing_count', v_backlog
    ));
  END IF;

  -- 4. Failed_permanent surto recente (>10 na última hora) usando coluna estável
  SELECT count(*) INTO v_failed_perm_recent
    FROM public.invoices
   WHERE status = 'failed_permanent'
     AND failed_permanent_at > now() - interval '1 hour'
     AND deleted_at IS NULL;

  IF v_failed_perm_recent > 10 THEN
    v_alerts := v_alerts || jsonb_build_array(jsonb_build_object(
      'type', 'failed_permanent_spike',
      'severity', 'medium',
      'count_last_hour', v_failed_perm_recent
    ));
  END IF;

  -- 5. Circuit breakers abertos (per-tenant aware)
  SELECT count(*),
         coalesce(jsonb_agg(jsonb_build_object(
           'service', service,
           'tenant_id', tenant_id,
           'opened_at', opened_at,
           'expires_at', expires_at,
           'failure_count', failure_count,
           'trip_count', trip_count,
           'last_failure_reason', last_failure_reason
         )), '[]'::jsonb)
    INTO v_breakers_open, v_breakers_open_list
    FROM public.circuit_breakers
   WHERE state = 'open' AND expires_at > now();

  IF v_breakers_open > 0 THEN
    v_alerts := v_alerts || jsonb_build_array(jsonb_build_object(
      'type', 'circuit_breaker_open',
      'severity', 'high',
      'breakers', v_breakers_open_list
    ));
  END IF;

  RETURN jsonb_build_object(
    'checked_at', now(),
    'alerts', v_alerts,
    'has_alerts', jsonb_array_length(v_alerts) > 0,
    'stats', jsonb_build_object(
      'analyzing_backlog', v_backlog,
      'stuck_jobs_active', v_stuck_active,
      'stuck_jobs_paused_reauth', v_stuck_reauth,
      'breakers_open', v_breakers_open,
      'failed_permanent_last_hour', v_failed_perm_recent,
      'recent_terminal_sample', v_recent_total
    )
  );
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 5. S1 — watchdog cron respeita circuit breaker
-- ─────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-jobs-watchdog') THEN
    PERFORM cron.unschedule('sync-jobs-watchdog');
  END IF;
END $$;

SELECT cron.schedule(
  'sync-jobs-watchdog',
  '* * * * *',
  $cron$
    SELECT public.trigger_sync_worker('discover-emails', jsonb_build_object('sync_job_id', sj.id))
      FROM public.sync_jobs sj
     WHERE sj.status IN ('queued','discovering')
       AND sj.last_heartbeat_at < now() - interval '90 seconds';

    SELECT public.trigger_sync_worker('fetch-attachments', '{}'::jsonb)
      FROM generate_series(1, 5) AS g(n)
     WHERE public.has_pickable_invoices_for_processing('discovered');

    UPDATE public.invoices
       SET status = 'discovered',
           lock_release_count = lock_release_count + 1
     WHERE status = 'fetching'
       AND locked_until IS NULL
       AND deleted_at IS NULL
       AND lock_release_count < 3;

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

    -- analyze-batch: só se há invoices E breaker gemini global não está open
    SELECT public.trigger_sync_worker('analyze-batch', '{}'::jsonb)
      FROM generate_series(1, 5) AS g(n)
     WHERE public.has_pickable_invoices_for_processing('analyzing')
       AND NOT EXISTS (
         SELECT 1 FROM public.circuit_breakers
          WHERE service = 'gemini' AND tenant_id IS NULL
            AND state = 'open' AND expires_at > now()
       );

    -- finalize-batch: só se há invoices E breaker drive global não está open
    SELECT public.trigger_sync_worker('finalize-batch', '{}'::jsonb)
      FROM generate_series(1, 5) AS g(n)
     WHERE public.has_pickable_invoices_for_finalize()
       AND NOT EXISTS (
         SELECT 1 FROM public.circuit_breakers
          WHERE service = 'drive' AND tenant_id IS NULL
            AND state = 'open' AND expires_at > now()
       );
  $cron$
);
