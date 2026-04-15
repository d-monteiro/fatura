-- Roles globais (cross-tenant). Separado de tenant_users.role (que é per-tenant).
-- Usado por AdminLayout + hook useIsAdmin() para expor o painel /admin.

CREATE TABLE IF NOT EXISTS user_roles_global (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'support')),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE user_roles_global ENABLE ROW LEVEL SECURITY;

-- Helper SECURITY DEFINER (mesmo padrão de get_user_tenant_ids).
-- Evita recursão RLS e permite usar dentro de outras policies.
CREATE OR REPLACE FUNCTION is_admin_global(uid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles_global
    WHERE user_id = uid AND role = 'admin'
  );
$$;

GRANT EXECUTE ON FUNCTION is_admin_global(UUID) TO authenticated;

-- Policies: o próprio user consegue ler a sua role (para o hook useIsAdmin).
-- Escrita só via service_role (seed manual ou futuro painel super-admin).
CREATE POLICY "self_read_role" ON user_roles_global FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "service_all_roles" ON user_roles_global FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Seed: primeiro admin. Resolve UUID a partir do email em auth.users.
-- Idempotente: ON CONFLICT DO NOTHING.
INSERT INTO user_roles_global (user_id, role)
SELECT id, 'admin'
FROM auth.users
WHERE email = 'duartemsm26@gmail.com'
ON CONFLICT (user_id) DO NOTHING;
