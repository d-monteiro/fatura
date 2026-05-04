-- Fase 8: o Supabase auto-GRANT-a EXECUTE a anon/authenticated nas funções
-- públicas. As RPCs de circuit breaker, monitor e trigger são INTERNAS
-- (workers + cron); revogar explicitamente para fechar advisors.
-- get_admin_sync_metrics + get_admin_invoice_pipeline_metrics ficam abertas
-- a authenticated porque têm check interno is_admin_global().

REVOKE EXECUTE ON FUNCTION public.circuit_breaker_check(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.circuit_breaker_record_failure(text, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.circuit_breaker_record_success(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_jobs_monitor_check() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_sync_monitor() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_admin_sync_metrics() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_admin_invoice_pipeline_metrics() FROM anon;
