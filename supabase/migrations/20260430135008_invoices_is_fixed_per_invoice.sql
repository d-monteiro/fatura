-- F1: cada fatura pode ter is_fixed próprio (default vem da categoria, mas
-- o utilizador pode marcar uma fatura específica como fixa/variável sem
-- alterar a categoria. Útil para "Software" que normalmente é variável mas
-- esta SaaS específica é mensal contratual.)
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS is_fixed boolean;

COMMENT ON COLUMN invoices.is_fixed IS
  'Override do is_fixed da categoria. NULL = herda da categoria.';

CREATE INDEX IF NOT EXISTS idx_invoices_is_fixed
  ON invoices (tenant_id, is_fixed)
  WHERE deleted_at IS NULL AND is_fixed IS NOT NULL;
