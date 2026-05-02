-- Apagar utilizador + tudo o que está ligado, atomicamente.
-- Resolve o problema de testes: limpar conta para refazer onboarding sem
-- deixar identities/tenant_users/tokens órfãos (que causam "User not found"
-- no próximo OAuth pelo mesmo provider_id Google).
--
-- Estratégia:
--  1) AuthZ: só admins globais (is_admin_global).
--  2) session_replication_role = replica → bypass triggers da app
--     (em particular prevent_orphan_tenant que impede DELETE do último owner).
--  3) Apagar tenants onde o user é único owner activo → CASCADE limpa
--     tenant_users, invoices, suppliers, tickets, audit_log, etc. desses tenants.
--  4) Apagar manualmente as referências em tabelas com FK NO ACTION para
--     auth.users (tickets, user_oauth_tokens, email_accounts, etc.)
--     porque essas FKs não cascadeiam.
--  5) DELETE FROM auth.users → CASCADE limpa auth.identities, sessions,
--     mfa_factors, tenant_users restantes, admin_users.

CREATE OR REPLACE FUNCTION public.admin_delete_user_completely(target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_email text;
  v_tenants_deleted int := 0;
  v_user_deleted boolean := false;
BEGIN
  IF v_caller IS NULL OR NOT public.is_admin_global(v_caller) THEN
    RAISE EXCEPTION 'Forbidden: requires global admin' USING ERRCODE = '42501';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = target_user_id;
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'User % not found in auth.users', target_user_id USING ERRCODE = 'P0002';
  END IF;

  PERFORM set_config('session_replication_role', 'replica', true);

  WITH solo_tenants AS (
    SELECT tu.tenant_id FROM public.tenant_users tu
    WHERE tu.user_id = target_user_id AND tu.role = 'owner' AND tu.is_active = true
      AND NOT EXISTS (
        SELECT 1 FROM public.tenant_users tu2
        WHERE tu2.tenant_id = tu.tenant_id AND tu2.user_id <> target_user_id
          AND tu2.role = 'owner' AND tu2.is_active = true
      )
  ),
  del AS (DELETE FROM public.tenants WHERE id IN (SELECT tenant_id FROM solo_tenants) RETURNING 1)
  SELECT COUNT(*) INTO v_tenants_deleted FROM del;

  DELETE FROM public.ticket_messages WHERE ticket_id IN (
    SELECT id FROM public.tickets WHERE user_id = target_user_id
  );
  DELETE FROM public.tickets WHERE user_id = target_user_id;
  UPDATE public.tickets SET resolved_by = NULL WHERE resolved_by = target_user_id;
  DELETE FROM public.user_oauth_tokens WHERE user_id = target_user_id;
  DELETE FROM public.email_accounts WHERE user_id = target_user_id;
  DELETE FROM public.audit_log WHERE user_id = target_user_id;
  DELETE FROM public.error_logs WHERE user_id = target_user_id;
  DELETE FROM public.onboarding_submissions WHERE user_id = target_user_id;
  UPDATE public.tenant_invites SET invited_by = NULL WHERE invited_by = target_user_id;
  UPDATE public.tenant_invites SET accepted_by = NULL WHERE accepted_by = target_user_id;
  UPDATE public.tenant_users SET invited_by = NULL WHERE invited_by = target_user_id;

  DELETE FROM auth.users WHERE id = target_user_id;
  v_user_deleted := FOUND;

  PERFORM set_config('session_replication_role', 'origin', true);

  RETURN jsonb_build_object(
    'user_id', target_user_id,
    'email', v_email,
    'tenants_deleted', v_tenants_deleted,
    'user_deleted', v_user_deleted
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_user_completely(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_user_completely(uuid) TO authenticated;
COMMENT ON FUNCTION public.admin_delete_user_completely(uuid) IS
  'Apaga utilizador + tudo o que esta ligado (tenants onde e unico owner, tickets, tokens, etc.). Restrito a admins globais. Util para refazer testes de onboarding sem deixar identities orfas.';

CREATE OR REPLACE FUNCTION public.admin_delete_user_by_email(target_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid;
  v_normalized text := lower(trim(target_email));
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE lower(email) = v_normalized;
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'User % not found', target_email USING ERRCODE = 'P0002';
  END IF;
  RETURN public.admin_delete_user_completely(v_uid);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_user_by_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_user_by_email(text) TO authenticated;
COMMENT ON FUNCTION public.admin_delete_user_by_email(text) IS
  'Wrapper de admin_delete_user_completely por email. Restrito a admins globais.';
