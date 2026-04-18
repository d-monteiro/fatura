-- Remove colunas mortas do suppliers: escritas no pipeline mas nunca lidas para pré-preencher faturas.
-- Os defaults do fornecedor não eram usados em lado nenhum; metier/nature/cost_type da fatura
-- vêm sempre directamente do Gemini ou edição manual.

ALTER TABLE suppliers DROP COLUMN IF EXISTS default_metier;
ALTER TABLE suppliers DROP COLUMN IF EXISTS default_nature;
ALTER TABLE suppliers DROP COLUMN IF EXISTS default_cost_type;
