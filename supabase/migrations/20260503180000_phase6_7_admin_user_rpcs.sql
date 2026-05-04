-- =============================================================================
-- PLAN_HARDENING.md Fases 6 + 7 — RPCs admin/user para sync_jobs UI
-- =============================================================================
-- Backend para Fase 6 (UI admin /admin/sync-jobs) e Fase 7 (UI user
-- /sync/:job_id + botão "Importar últimos 3 meses").
--
-- Decisões:
--   - Membros de tenant podem ler sync_jobs via RLS members_read_sync_jobs já
--     existente — frontend faz select directo. Polling 5s + Realtime canal.
--   - INSERT/UPDATE de sync_jobs continua só service_role. RPCs SECURITY
--     DEFINER abrem janelas controladas (start_sync_job + cancel_sync_job
--     para users; admin_* só para is_admin_global).
--   - start_sync_job dispara discover-emails imediatamente via
--     trigger_sync_worker para não esperar 90s pelo watchdog.
--   - 1 job activo por tenant é imposto pelo unique partial index existente —
--     RPC traduz violation em RAISE com mensagem amigável.
--   - admin_reset_sync_job_failed_invoices desfaz failed_permanent: items que
--     já têm storage_path voltam a 'analyzing', os que não têm voltam a
--     'discovered'. Reset attempts/lock_release_count.
-- =============================================================================

-- =============================================================================
-- 1. start_sync_job(p_tenant_id, p_trigger, p_email_account_id?) — user-scoped
-- =============================================================================
-- Cria 1 sync_job para a conta de email indicada (ou primeira activa do
-- tenant) e dispara discover-emails imediatamente. RAISES se já há job
-- activo no tenant ou se o user não é membro.
CREATE OR REPLACE FUNCTION public.start_sync_job(
  p_tenant_id uuid,
  p_trigger text,
  p_email_account_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_account public.email_accounts%ROWTYPE;
  v_job_id uuid;
  v_query text;
  v_date_from timestamptz;
  v_date_to timestamptz;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501';
  END IF;

  IF p_trigger NOT IN ('manual', 'backfill_3m') THEN
    RAISE EXCEPTION 'Trigger inválido: %', p_trigger USING ERRCODE = '22023';
  END IF;

  IF NOT (p_tenant_id IN (SELECT public.get_user_tenant_ids())) THEN
    RAISE EXCEPTION 'Sem permissão para este tenant' USING ERRCODE = '42501';
  END IF;

  -- Pega conta indicada ou primeira activa
  IF p_email_account_id IS NOT NULL THEN
    SELECT * INTO v_account
      FROM public.email_accounts
     WHERE id = p_email_account_id
       AND tenant_id = p_tenant_id
       AND is_active = true;
  ELSE
    SELECT * INTO v_account
      FROM public.email_accounts
     WHERE tenant_id = p_tenant_id
       AND is_active = true
     ORDER BY created_at
     LIMIT 1;
  END IF;

  IF v_account.id IS NULL THEN
    RAISE EXCEPTION 'Sem conta Gmail activa para este tenant' USING ERRCODE = '22023';
  END IF;

  -- Constrói gmail_query consoante trigger
  IF p_trigger = 'manual' THEN
    v_query := 'has:attachment (filename:pdf OR filename:jpg OR filename:jpeg OR filename:png) newer_than:7d';
    v_date_from := NULL;
    v_date_to := NULL;
  ELSE
    -- backfill_3m: últimos 90 dias
    v_date_from := (now() - interval '90 days');
    v_date_to := now();
    v_query := 'has:attachment (filename:pdf OR filename:jpg OR filename:jpeg OR filename:png)'
            || ' after:' || to_char(v_date_from, 'YYYY/MM/DD')
            || ' before:' || to_char(v_date_to + interval '1 day', 'YYYY/MM/DD');
  END IF;

  -- INSERT — unique partial index trata 1-active-per-tenant
  BEGIN
    INSERT INTO public.sync_jobs (
      tenant_id, user_id, email_account_id, trigger,
      date_from, date_to, gmail_query, status
    ) VALUES (
      p_tenant_id, v_user_id, v_account.id, p_trigger,
      v_date_from, v_date_to, v_query, 'queued'
    )
    RETURNING id INTO v_job_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Já existe uma sincronização activa para este tenant'
      USING ERRCODE = '23505', HINT = 'Aguarde a actual terminar ou cancele-a.';
  END;

  -- Dispara worker imediatamente (não espera 90s do watchdog)
  PERFORM public.trigger_sync_worker(
    'discover-emails',
    jsonb_build_object('sync_job_id', v_job_id)
  );

  RETURN v_job_id;
END;
$$;

REVOKE ALL ON FUNCTION public.start_sync_job(uuid, text, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.start_sync_job(uuid, text, uuid) TO authenticated;

COMMENT ON FUNCTION public.start_sync_job(uuid, text, uuid) IS
  'User-scoped. Cria sync_job manual ou backfill_3m e dispara discover-emails. RAISES se já há job activo.';

-- =============================================================================
-- 2. cancel_sync_job(p_job_id) — user-scoped
-- =============================================================================
-- Marca sync_job como cancelado. Workers detectam isto e param de pegar
-- batches deste job. Items em fases não-terminais ficam órfãos do job mas
-- continuam (são reaproveitados se sobreviverem). UI mostra-os com badge
-- "Cancelado".
CREATE OR REPLACE FUNCTION public.cancel_sync_job(p_job_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_tenant_id uuid;
  v_status text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501';
  END IF;

  SELECT tenant_id, status INTO v_tenant_id, v_status
    FROM public.sync_jobs WHERE id = p_job_id;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Sync job não encontrado' USING ERRCODE = '02000';
  END IF;

  IF NOT (v_tenant_id IN (SELECT public.get_user_tenant_ids())) THEN
    RAISE EXCEPTION 'Sem permissão para este sync job' USING ERRCODE = '42501';
  END IF;

  IF v_status IN ('done', 'cancelled', 'error') THEN
    RAISE EXCEPTION 'Sync job já está em estado terminal: %', v_status
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.sync_jobs
     SET status = 'cancelled',
         completed_at = now(),
         error_message = COALESCE(error_message, 'Cancelado pelo utilizador')
   WHERE id = p_job_id
     AND status IN ('queued','discovering','processing','paused_reauth');
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_sync_job(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.cancel_sync_job(uuid) TO authenticated;

COMMENT ON FUNCTION public.cancel_sync_job(uuid) IS
  'User-scoped. Marca sync_job como cancelled. Workers detectam e param.';

-- =============================================================================
-- 3. admin_get_sync_jobs(p_filter, p_limit, p_offset) — admin-only
-- =============================================================================
-- Lista sync_jobs com info do tenant. Filtros: 'active' (queued/discovering/
-- processing/paused_reauth), 'recent' (últimas 7d), 'errors', 'all'.
CREATE OR REPLACE FUNCTION public.admin_get_sync_jobs(
  p_filter text DEFAULT 'recent',
  p_limit int DEFAULT 200,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  tenant_id uuid,
  tenant_name text,
  user_id uuid,
  email_account_id uuid,
  email_address text,
  trigger text,
  status text,
  total_messages_seen int,
  total_invoices_created int,
  counts_by_status jsonb,
  error_message text,
  started_at timestamptz,
  last_heartbeat_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    sj.id,
    sj.tenant_id,
    t.name AS tenant_name,
    sj.user_id,
    sj.email_account_id,
    ea.email AS email_address,
    sj.trigger,
    sj.status,
    sj.total_messages_seen,
    sj.total_invoices_created,
    sj.counts_by_status,
    sj.error_message,
    sj.started_at,
    sj.last_heartbeat_at,
    sj.completed_at,
    sj.created_at
  FROM public.sync_jobs sj
  LEFT JOIN public.tenants t ON t.id = sj.tenant_id
  LEFT JOIN public.email_accounts ea ON ea.id = sj.email_account_id
  WHERE public.is_admin_global(auth.uid())
    AND CASE p_filter
      WHEN 'active' THEN sj.status IN ('queued','discovering','processing','paused_reauth')
      WHEN 'errors'  THEN sj.status = 'error'
      WHEN 'recent'  THEN sj.created_at > now() - interval '7 days'
      WHEN 'all'     THEN TRUE
      ELSE sj.created_at > now() - interval '7 days'
    END
  ORDER BY sj.created_at DESC
  LIMIT GREATEST(1, LEAST(p_limit, 1000))
  OFFSET GREATEST(0, p_offset);
$$;

REVOKE ALL ON FUNCTION public.admin_get_sync_jobs(text, int, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_sync_jobs(text, int, int) TO authenticated;

COMMENT ON FUNCTION public.admin_get_sync_jobs(text, int, int) IS
  'Admin-only. Lista sync_jobs com tenant info. Filtros: active, errors, recent (default 7d), all.';

-- =============================================================================
-- 4. admin_get_sync_job_detail(p_job_id) — admin-only
-- =============================================================================
-- Retorna sync_job + breakdown de invoices (count por status) para detail
-- page admin. Frontend pode buscar a lista de invoices recentes em pull
-- separado se quiser.
CREATE OR REPLACE FUNCTION public.admin_get_sync_job_detail(p_job_id uuid)
RETURNS TABLE (
  id uuid,
  tenant_id uuid,
  tenant_name text,
  user_id uuid,
  user_email text,
  email_account_id uuid,
  email_address text,
  trigger text,
  status text,
  date_from timestamptz,
  date_to timestamptz,
  gmail_query text,
  gmail_page_token text,
  total_messages_seen int,
  total_invoices_created int,
  counts_by_status jsonb,
  invoices_breakdown jsonb,
  error_message text,
  started_at timestamptz,
  last_heartbeat_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_global(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas admins' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT
      sj.id,
      sj.tenant_id,
      t.name AS tenant_name,
      sj.user_id,
      u.email::text AS user_email,
      sj.email_account_id,
      ea.email AS email_address,
      sj.trigger,
      sj.status,
      sj.date_from,
      sj.date_to,
      sj.gmail_query,
      sj.gmail_page_token,
      sj.total_messages_seen,
      sj.total_invoices_created,
      sj.counts_by_status,
      COALESCE((
        SELECT jsonb_object_agg(status_key, n)
          FROM (
            SELECT i.status AS status_key, count(*) AS n
              FROM public.invoices i
             WHERE i.sync_job_id = sj.id
             GROUP BY i.status
          ) s
      ), '{}'::jsonb) AS invoices_breakdown,
      sj.error_message,
      sj.started_at,
      sj.last_heartbeat_at,
      sj.completed_at,
      sj.created_at
    FROM public.sync_jobs sj
    LEFT JOIN public.tenants t ON t.id = sj.tenant_id
    LEFT JOIN public.email_accounts ea ON ea.id = sj.email_account_id
    LEFT JOIN auth.users u ON u.id = sj.user_id
    WHERE sj.id = p_job_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_sync_job_detail(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_sync_job_detail(uuid) TO authenticated;

COMMENT ON FUNCTION public.admin_get_sync_job_detail(uuid) IS
  'Admin-only. Detalhe de 1 sync_job com breakdown de invoices por status (live).';

-- =============================================================================
-- 5. admin_cancel_sync_job(p_job_id) — admin-only
-- =============================================================================
CREATE OR REPLACE FUNCTION public.admin_cancel_sync_job(p_job_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_global(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas admins' USING ERRCODE = '42501';
  END IF;

  UPDATE public.sync_jobs
     SET status = 'cancelled',
         completed_at = now(),
         error_message = COALESCE(error_message, 'Cancelado por admin')
   WHERE id = p_job_id
     AND status IN ('queued','discovering','processing','paused_reauth');
END;
$$;

REVOKE ALL ON FUNCTION public.admin_cancel_sync_job(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_cancel_sync_job(uuid) TO authenticated;

-- =============================================================================
-- 6. admin_reset_sync_job_failed_invoices(p_job_id) — admin-only
-- =============================================================================
-- Tira invoices em failed_permanent deste job de volta ao pipeline. Items
-- com storage_path voltam a 'analyzing' (pulam fetch); sem storage_path
-- voltam a 'discovered'. Reset attempts/lock_release_count/last_error/
-- next_retry_at/locked_until. Devolve quantos items mudaram.
CREATE OR REPLACE FUNCTION public.admin_reset_sync_job_failed_invoices(p_job_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int := 0;
BEGIN
  IF NOT public.is_admin_global(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas admins' USING ERRCODE = '42501';
  END IF;

  WITH updated AS (
    UPDATE public.invoices
       SET status = CASE
                      WHEN storage_path IS NOT NULL AND storage_path <> '' THEN 'analyzing'
                      ELSE 'discovered'
                    END,
           attempts = 0,
           lock_release_count = 0,
           last_error = NULL,
           next_retry_at = NULL,
           locked_until = NULL,
           deleted_at = NULL
     WHERE sync_job_id = p_job_id
       AND status = 'failed_permanent'
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM updated;

  IF v_count > 0 THEN
    -- Re-fresca os contadores do job para a UI reflectir
    PERFORM public.refresh_sync_job_counts(p_job_id);
    -- Re-acorda watchdog: dispara workers já já
    PERFORM public.trigger_sync_worker('fetch-attachments', '{}'::jsonb);
    PERFORM public.trigger_sync_worker('analyze-batch', '{}'::jsonb);
  END IF;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reset_sync_job_failed_invoices(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_reset_sync_job_failed_invoices(uuid) TO authenticated;

COMMENT ON FUNCTION public.admin_reset_sync_job_failed_invoices(uuid) IS
  'Admin-only. Devolve invoices failed_permanent ao pipeline. Items com storage_path -> analyzing, sem -> discovered. Retorna count.';
