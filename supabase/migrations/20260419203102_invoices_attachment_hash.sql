-- Hash do attachment para evitar reprocessar o MESMO PDF que chega em
-- emails diferentes (forwards, cópias internas). Sem isto pagavamos
-- N chamadas Gemini para o mesmo binário.

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS attachment_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS invoices_attachment_hash_unique
  ON invoices (tenant_id, attachment_hash)
  WHERE attachment_hash IS NOT NULL AND deleted_at IS NULL;
