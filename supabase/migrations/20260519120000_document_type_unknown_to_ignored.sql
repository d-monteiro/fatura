-- Backfill: faturas em review com review_reason='document_type_unknown:...'
-- passam a ignoradas (soft-delete). A partir desta data, analyze-document
-- (modo by-invoice) já manda directo para ignoradas em vez de review.
-- Mantém o ficheiro no bucket para preview na aba Ignoradas durante 30d.

UPDATE public.invoices
SET
  deleted_at = NOW(),
  status = 'cancelled',
  manual_review = false
WHERE deleted_at IS NULL
  AND review_reason LIKE 'document_type_unknown:%';
