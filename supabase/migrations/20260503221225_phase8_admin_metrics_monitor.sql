-- PLAN_HARDENING Fase 8 §11.2: views de observabilidade + RPC monitor + cron

-- View de throughput de sync_jobs (últimos 7 dias agregados por hora)
-- security_invoker delega RLS à underlying sync_jobs (member_of_tenant);
-- service_role bypassa, admins acedem via wrapper RPC abaixo.
CREATE OR REPLACE VIEW public.admin_sync_metrics
WITH (security_invoker = true)
AS
SELECT
  date_trunc('hour', created_at) AS hour,
  count(*) AS jobs_total,
  count(*) FILTER (WHERE status='done') AS jobs_done,
  count(*) FILTER (WHERE status='error') AS jobs_error,
  count(*) FILTER (WHERE status IN ('queued','discovering','processing')) AS jobs_active,
  count(*) FILTER (WHERE status='paused_reauth') AS jobs_paused_reauth,
  count(*) FILTER (WHERE status='cancelled') AS jobs_cancelled,
  avg(EXTRACT(EPOCH FROM (completed_at - started_at))) FILTER (WHERE status='done')::int AS avg_duration_seconds,
  coalesce(sum(total_invoices_created), 0) AS invoices_created
FROM public.sync_jobs
WHERE created_at > now() - interval '7 days'
GROUP BY 1
ORDER BY 1 DESC;

-- View de pipeline interno: items por status, lock state, retry budget
CREATE OR REPLACE VIEW public.admin_invoice_pipeline_metrics
WITH (security_invoker = true)
AS
SELECT
  status,
  count(*) AS total,
  count(*) FILTER (WHERE locked_until > now()) AS locked,
  count(*) FILTER (WHERE next_retry_at > now()) AS retry_pending,
  count(*) FILTER (WHERE attempts >= 3) AS budget_exhausted,
  avg(attempts)::numeric(4,2) AS avg_attempts,
  max(attempts) AS max_attempts
FROM public.invoices
WHERE deleted_at IS NULL
  AND status IN ('discovered','analyzing','extracted','review','inbox','failed_permanent','rejected')
GROUP BY status
ORDER BY status;

-- Wrapper RPC para admin global: bypassa RLS e expõe a view.
CREATE OR REPLACE FUNCTION public.get_admin_sync_metrics()
RETURNS SETOF public.admin_sync_metrics
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NOT public.is_admin_global() THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM public.admin_sync_metrics;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_invoice_pipeline_metrics()
RETURNS SETOF public.admin_invoice_pipeline_metrics
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NOT public.is_admin_global() THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM public.admin_invoice_pipeline_metrics;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_sync_metrics() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_admin_invoice_pipeline_metrics() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_sync_metrics() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_invoice_pipeline_metrics() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- Monitor: detecta condições de alerta, devolve JSON consumido pelo cron
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.sync_jobs_monitor_check()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_alerts jsonb := '[]'::jsonb;
  v_stuck_jobs int;
  v_stuck_jobs_list jsonb;
  v_recent_total int;
  v_recent_failed int;
  v_error_rate numeric;
  v_backlog int;
  v_breakers_open int;
  v_breakers_open_list jsonb;
  v_failed_perm_recent int;
BEGIN
  -- 1. Jobs activos sem heartbeat há mais de 1h
  WITH stuck AS (
    SELECT id, tenant_id, status, last_heartbeat_at,
           EXTRACT(EPOCH FROM (now() - last_heartbeat_at))::int AS stale_seconds
      FROM public.sync_jobs
     WHERE status IN ('queued','discovering','processing')
       AND last_heartbeat_at < now() - interval '1 hour'
     ORDER BY last_heartbeat_at
     LIMIT 10
  )
  SELECT count(*),
         coalesce(jsonb_agg(to_jsonb(stuck.*)), '[]'::jsonb)
    INTO v_stuck_jobs, v_stuck_jobs_list
    FROM stuck;

  IF v_stuck_jobs > 0 THEN
    v_alerts := v_alerts || jsonb_build_array(jsonb_build_object(
      'type', 'stuck_jobs',
      'severity', 'high',
      'count', v_stuck_jobs,
      'jobs', v_stuck_jobs_list
    ));
  END IF;

  -- 2. Error rate >20% nos últimos 100 items terminais (24h)
  SELECT count(*), count(*) FILTER (WHERE status='failed_permanent')
    INTO v_recent_total, v_recent_failed
    FROM (
      SELECT status FROM public.invoices
       WHERE status IN ('failed_permanent','completed','inbox','rejected')
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

  -- 4. Failed_permanent surto recente (>10 na última hora)
  SELECT count(*) INTO v_failed_perm_recent
    FROM public.invoices
   WHERE status = 'failed_permanent'
     AND updated_at > now() - interval '1 hour'
     AND deleted_at IS NULL;

  IF v_failed_perm_recent > 10 THEN
    v_alerts := v_alerts || jsonb_build_array(jsonb_build_object(
      'type', 'failed_permanent_spike',
      'severity', 'medium',
      'count_last_hour', v_failed_perm_recent
    ));
  END IF;

  -- 5. Circuit breakers abertos
  SELECT count(*),
         coalesce(jsonb_agg(jsonb_build_object(
           'service', service,
           'opened_at', opened_at,
           'expires_at', expires_at,
           'failure_count', failure_count,
           'trip_count', trip_count,
           'last_failure_reason', last_failure_reason
         )), '[]'::jsonb)
    INTO v_breakers_open, v_breakers_open_list
    FROM public.circuit_breakers
   WHERE state = 'open';

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
      'stuck_jobs', v_stuck_jobs,
      'breakers_open', v_breakers_open,
      'failed_permanent_last_hour', v_failed_perm_recent,
      'recent_terminal_sample', v_recent_total
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.sync_jobs_monitor_check() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_jobs_monitor_check() TO service_role;

-- Trigger dedicado para Edge Function `sync-monitor`. Mantemos `trigger_sync_worker`
-- com whitelist intacta (4 workers do pipeline).
CREATE OR REPLACE FUNCTION public.trigger_sync_monitor()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_request_id bigint;
  v_secret text;
  v_url text;
BEGIN
  SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets
   WHERE name = 'sync_worker_secret'
   LIMIT 1;
  IF v_secret IS NULL OR v_secret = '' THEN
    RAISE EXCEPTION 'Vault secret sync_worker_secret não encontrado' USING ERRCODE = '22000';
  END IF;

  v_url := 'https://sxfwprydmllovnxxjhrh.supabase.co/functions/v1/sync-monitor';

  SELECT net.http_post(
    url := v_url,
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

REVOKE ALL ON FUNCTION public.trigger_sync_monitor() FROM PUBLIC;
