-- ============================================
-- Cron jobs (executar uma vez no Supabase SQL Editor)
-- ============================================
-- Requer extensions pg_cron + pg_net (ativar em Database → Extensions).
-- Requer secret CRON_SECRET configurado na Edge Function sync-email.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Substituir <PROJECT_REF> e <CRON_SECRET_VALUE> antes de correr.
-- O CRON_SECRET é um segredo partilhado entre esta query e a Edge Function
-- (configurar como secret CRON_SECRET no dashboard da função). Validado
-- via header `x-cron-secret`. Nunca usar service_role em plain text aqui.
-- Schedule: diário às 23:58 UTC.
SELECT cron.schedule(
  'sync-email-daily',
  '58 23 * * *',
  $$
  SELECT net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/sync-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '<CRON_SECRET_VALUE>'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Para remover:
-- SELECT cron.unschedule('sync-email-daily');

-- Para rotacionar o secret:
-- 1) Actualizar CRON_SECRET no dashboard da Edge Function sync-email
-- 2) SELECT cron.unschedule('sync-email-daily');
-- 3) Re-executar o bloco acima com o novo valor

-- ============================================
-- Relatórios automáticos (hora cheia UTC)
-- ============================================
-- Corre todas as horas. A Edge Function `send-auto-reports` filtra os tenants
-- em função do timezone local (envia seg 08h local para weekly, dia 1 08h
-- local para monthly). Idempotência via report_deliveries.
SELECT cron.schedule(
  'send-auto-reports-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/send-auto-reports',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '<CRON_SECRET_VALUE>'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Para remover:
-- SELECT cron.unschedule('send-auto-reports-hourly');

-- ============================================
-- Alerta de prazos de pagamento (08h UTC diário)
-- ============================================
-- A Edge Function `check-due-dates` selecciona faturas por pagar com
-- data_vencimento <= today+3d (ou já vencidas), ainda sem payment_notified_at,
-- e envia 1 email consolidado por tenant. O trigger
-- trg_reset_payment_notified em invoices reactiva notificação se o user
-- editar data_vencimento.
SELECT cron.schedule(
  'check-due-dates-daily',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/check-due-dates',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '<CRON_SECRET_VALUE>'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Para remover:
-- SELECT cron.unschedule('check-due-dates-daily');
