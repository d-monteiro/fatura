-- ============================================
-- drive_folders — cache + lock atómico para pastas do Google Drive
-- ============================================
-- Serve dois propósitos:
--   1. Cache do folder_id canónico por (tenant, path), para nunca mais
--      chamar Drive API search para paths já conhecidos.
--   2. Lock atómico entre workers concorrentes via INSERT ON CONFLICT.
--      Antes: `ensureFolder` fazia search-then-create contra uma API que
--      permite múltiplas pastas com o mesmo nome no mesmo parent, o que
--      com o cron `reprocess-pending-15min` a correr concurrency=2 criava
--      2-3 pastas para os mesmos paths.
--
-- Protocolo de uso (helper ensureFolderPath no _shared):
--   1. Para cada segment do path (cumulativo), calcular path_hash.
--   2. SELECT — se folder_id não-null, usa.
--   3. INSERT ... ON CONFLICT DO NOTHING — se ganhou, é o único a criar.
--      Chama Drive API (com search defensivo para adoptar pastas legacy)
--      e UPDATE folder_id.
--   4. Se perdeu o INSERT, polling curto até folder_id aparecer.
--   5. Rows órfãs (folder_id NULL > 30s) são abandonadas e reclamáveis.
-- ============================================

CREATE TABLE IF NOT EXISTS drive_folders (
  tenant_id       uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  -- sha256(lower(path)) truncado a 32 hex chars. path = segments.join('/')
  -- lower-case para idempotência contra 'Abril' vs 'ABRIL'.
  path_hash       text        NOT NULL,
  -- Path legível para debug. Não usar para lookup (case pode variar).
  path            text        NOT NULL,
  -- Último segmento (ex: 'Abril'). Útil para queries administrativas.
  name            text        NOT NULL,
  -- Drive ID do parent. NULL = root da Drive do utilizador.
  parent_drive_id text,
  -- Drive ID desta pasta. NULL durante o lock, preenchido após create.
  folder_id       text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  -- Preenchido quando folder_id é gravado — distingue locks activos
  -- de locks concluídos.
  completed_at    timestamptz,
  PRIMARY KEY (tenant_id, path_hash)
);

-- Para administração: ver todas as pastas de um tenant.
CREATE INDEX IF NOT EXISTS drive_folders_tenant_idx
  ON drive_folders (tenant_id, created_at DESC);

-- Para detectar órfãos (lock adquirido mas nunca completado — crash).
CREATE INDEX IF NOT EXISTS drive_folders_pending_idx
  ON drive_folders (created_at)
  WHERE folder_id IS NULL;

-- RLS: tabela infra-estrutural, só service role escreve/lê.
-- Utilizadores comuns não precisam aceder — a Edge Function usa service key.
ALTER TABLE drive_folders ENABLE ROW LEVEL SECURITY;

-- Sem policies = bloqueio total para authenticated/anon. Service role
-- passa por cima do RLS (bypass). Admins podem ler via SQL Editor.
COMMENT ON TABLE drive_folders IS
  'Cache e lock atómico para pastas do Google Drive. Escrita exclusiva por Edge Functions (service role).';
