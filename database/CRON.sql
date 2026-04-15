-- ============================================
-- Cron jobs (executar uma vez no Supabase SQL Editor)
-- ============================================
-- Requer extensions pg_cron + pg_net (ativar em Database → Extensions).

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Substituir <PROJECT_REF> e <SERVICE_ROLE_KEY> antes de correr.
-- Schedule: diário às 23:58 UTC.
SELECT cron.schedule(
  'sync-email-daily',
  '58 23 * * *',
  $$
  SELECT net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/sync-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Para remover:
-- SELECT cron.unschedule('sync-email-daily');
