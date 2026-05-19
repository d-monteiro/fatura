-- O whitelist do constraint invoices_status_check (criado em 20260503130000_phase1_hardening_review.sql)
-- esqueceu-se de 'processed' e 'pending', que continuam a ser usados pelo frontend
-- (useBulkActions.ts, InvoiceDetailDrawer.tsx) para marcar faturas validadas pelo utilizador
-- e pelos triggers de audit (review -> processed = action 'approve').
-- Resultado: desde 2026-05-03, qualquer aprovação de fatura falhava silenciosamente.
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_status_check
  CHECK (status IN (
    'pending','inbox','analyzing','review','processed','failed',
    'discovered','fetching','extracted','completed',
    'rejected','duplicate','failed_permanent','cancelled'
  ));
