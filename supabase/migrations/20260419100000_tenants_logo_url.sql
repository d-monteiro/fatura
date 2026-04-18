-- Adiciona coluna logo_url a tenants (se ainda não existir).
-- Já era usada por finalize.persistLogo e pela Sidebar, mas não estava no schema canónico.

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS logo_url TEXT;
