-- PLAN_HARDENING Fase 8: cron sync-jobs-monitor + desactivar reprocess-pending legado.
--
-- Após Fases 4-5 o pipeline é totalmente coberto por discover/fetch/analyze/finalize.
-- O cron `reprocess-pending-15min` ficava como safety net mas duplica trabalho com
-- analyze-batch (mesmo lock optimista) e potencialmente Drive com finalize-batch.
-- Edge Function `reprocess-pending` mantém-se deployada para invocação manual em
-- caso de rollback emergencial (§10.3 do plano).

-- Cron de monitor: 10 em 10 minutos
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-jobs-monitor') THEN
    PERFORM cron.unschedule('sync-jobs-monitor');
  END IF;
END $$;

SELECT cron.schedule(
  'sync-jobs-monitor',
  '*/10 * * * *',
  $cron$ SELECT public.trigger_sync_monitor(); $cron$
);

-- Desactivar reprocess-pending-15min: mantemos a Edge Function mas tiramos o cron
-- (era duplicação de analyze-batch/finalize-batch). Rollback: re-correr a SELECT
-- abaixo trocando active=true.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reprocess-pending-15min') THEN
    PERFORM cron.unschedule('reprocess-pending-15min');
  END IF;
END $$;
