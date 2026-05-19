-- Fix cron-trigger das sincronizações nocturnas.
--
-- Sintoma: desde 2026-05-05, cron-trigger falha todas as noites com
--   duplicate key value violates unique constraint "uniq_sync_jobs_active_per_tenant"
-- Causa: INSERT ... SELECT FROM email_accounts tenta criar N rows com mesmo
--   tenant_id quando existem múltiplas contas activas no mesmo tenant.
--   Unique partial index em tenant_id bloqueia o segundo INSERT e dá rollback
--   de toda a transacção -> zero jobs criados.
-- Fix: DISTINCT ON (tenant_id) escolhe uma única conta por tenant (a mais
--   recentemente sincronizada). Sem ON CONFLICT — o NOT EXISTS já garante
--   que não há job activo a colidir.
-- Bónus: reagenda de 58 23 * * * para 0 23 * * * UTC (= 00:00 Lisboa WEST).

CREATE OR REPLACE FUNCTION public.cron_create_nightly_sync_jobs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count int;
BEGIN
  WITH inserted AS (
    INSERT INTO public.sync_jobs (
      tenant_id, user_id, email_account_id, trigger,
      gmail_query, status
    )
    SELECT DISTINCT ON (ea.tenant_id)
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
    ORDER BY ea.tenant_id, ea.last_sync_at DESC NULLS LAST, ea.created_at DESC
    RETURNING id
  )
  SELECT count(*)::int INTO v_count FROM inserted;

  RETURN v_count;
END;
$function$;

SELECT cron.unschedule('sync-jobs-cron-trigger');
SELECT cron.schedule(
  'sync-jobs-cron-trigger',
  '0 23 * * *',
  $$ SELECT public.cron_create_nightly_sync_jobs(); $$
);
