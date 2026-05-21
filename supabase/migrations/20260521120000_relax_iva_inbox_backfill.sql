-- Suavização da validação de IVA + fim do estado "inbox" como passo manual.
--
-- Contexto: o validador legado validateMontants corria uma 2.ª vez dentro do
-- finalizeInvoice e voltava a marcar para revisão faturas correctas
-- (arredondamentos de cêntimos, faturas onde a IA só apanhou o total). Com o
-- validador único e tolerante (extractValidation.checkIvaConsistency), re-
-- classificamos o histórico de todos os tenants.

-- 1. Faturas em revisão por aritmética de IVA que passam na regra tolerante
--    (5 cêntimos ou 1% do total), ou onde a IA só apanhou o total, saem da
--    fila de revisão para 'processed'. Erros aritméticos reais ficam.
update public.invoices
set status = 'processed',
    manual_review = false,
    review_reason = null
where deleted_at is null
  and status = 'review'
  and review_reason like 'iva_inconsistente%'
  and (
    autoliquidacao is true
    or valor_sem_iva is null
    or valor_iva is null
    or valor_total is null
    or abs(valor_sem_iva + valor_iva - valor_total) <= greatest(0.05, abs(valor_total) * 0.01)
  );

-- 2. "Inbox sem paragem": faturas que passaram a análise e ficavam paradas em
--    'inbox' à espera de clique manual passam a 'processed'. A partir desta
--    versão o pipeline já não produz 'inbox' (analyze-document/finalize-batch).
update public.invoices
set status = 'processed',
    manual_review = false
where deleted_at is null
  and status = 'inbox';
