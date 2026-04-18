-- Fan-out de sync-email: cada attachment vira 1 invoice em status 'analyzing'.
-- Unique antigo (tenant_id, email_message_id) impedia >1 attachment por email.
-- Novo: (tenant_id, email_message_id, email_attachment_id) com NULLs distintos
-- (uploads manuais mantêm ambos NULL, sem conflito).

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS email_attachment_id TEXT;

ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_tenant_id_email_message_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS invoices_email_unique
  ON invoices (tenant_id, email_message_id, email_attachment_id)
  WHERE email_message_id IS NOT NULL;
