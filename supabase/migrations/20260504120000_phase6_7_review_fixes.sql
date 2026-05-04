-- =============================================================================
-- PLAN_HARDENING.md Fases 6+7 — review fixes
-- =============================================================================
-- Code review post-implementação apanhou 4 bloqueadores + 4 sérios nas RPCs
-- de admin/user para sync_jobs (commit Codex). Esta migration consolida:
--
-- B2  Rate limit backfill_3m: bloquear nova invocação se houve uma nas
--     últimas 24h (qualquer status). Frontend escondia o card mas a RPC
--     ficava aberta — user com curl podia gastar €63/click.
--
-- B4  cancel_sync_job silenciava race com workers a marcarem 'done'. O
--     UPDATE com WHERE filtrado afectava 0 linhas mas a função retornava
--     sucesso. Adicionar GET DIAGNOSTICS + RAISE.
--
-- S10 admin_get_sync_jobs retornava 0 rows se não-admin (silencioso). O
--     irmão admin_get_sync_job_detail RAISES — uniformizar.
--
-- S11 admin_reset_sync_job_failed_invoices ressuscitava items de jobs em
--     estado terminal (cancelled/done/error). Workers acordavam para um
--     job morto, contadores ficavam dessincronizados.
--
-- S12 admin_reset heurística era duas-vias (storage_path → analyzing /
--     vazio → discovered). Items em 'extracted' que falharam em finalize
--     iam parar a 'analyzing' → forçava novo Gemini call (€). Three-way
--     usando confidence_score como sentinela "Gemini já correu".
-- =============================================================================

-- 1. start_sync_job — rate limit backfill_3m (B2) ----------------------------
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

  -- Rate limit backfill_3m: 1 por tenant por janela de 24h, qualquer status.
  -- Custo €63 em Gemini não pode ser triggable repetidamente por curl.
  IF p_trigger = 'backfill_3m' THEN
    IF EXISTS (
      SELECT 1 FROM public.sync_jobs
       WHERE tenant_id = p_tenant_id
         AND trigger = 'backfill_3m'
         AND created_at > now() - interval '24 hours'
    ) THEN
      RAISE EXCEPTION 'Já correu uma importação 3 meses nas últimas 24 horas'
        USING ERRCODE = '22023',
              HINT = 'Aguarde antes de reiniciar para evitar duplicar custos.';
    END IF;
  END IF;

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

  IF p_trigger = 'manual' THEN
    v_query := 'has:attachment (filename:pdf OR filename:jpg OR filename:jpeg OR filename:png) newer_than:7d';
    v_date_from := NULL;
    v_date_to := NULL;
  ELSE
    v_date_from := (now() - interval '90 days');
    v_date_to := now();
    v_query := 'has:attachment (filename:pdf OR filename:jpg OR filename:jpeg OR filename:png)'
            || ' after:' || to_char(v_date_from, 'YYYY/MM/DD')
            || ' before:' || to_char(v_date_to + interval '1 day', 'YYYY/MM/DD');
  END IF;

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

  PERFORM public.trigger_sync_worker(
    'discover-emails',
    jsonb_build_object('sync_job_id', v_job_id)
  );

  RETURN v_job_id;
END;
$$;

-- 2. cancel_sync_job — GET DIAGNOSTICS row count (B4) ------------------------
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
  v_rows int;
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

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  -- Race: workers podem ter concluído entre o SELECT acima e o UPDATE.
  -- Sem este check a função retornava sucesso silencioso e o frontend
  -- mostrava toast "cancelado" sobre uma operação que não aconteceu.
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'Sync job já transitou para estado terminal'
      USING ERRCODE = '22023';
  END IF;
END;
$$;

-- 3. admin_get_sync_jobs — RAISE se não-admin (S10) --------------------------
-- A versão LANGUAGE sql não permite RAISE; converter para plpgsql.
DROP FUNCTION IF EXISTS public.admin_get_sync_jobs(text, int, int);

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
    WHERE CASE p_filter
        WHEN 'active' THEN sj.status IN ('queued','discovering','processing','paused_reauth')
        WHEN 'errors'  THEN sj.status = 'error'
        WHEN 'recent'  THEN sj.created_at > now() - interval '7 days'
        WHEN 'all'     THEN TRUE
        ELSE sj.created_at > now() - interval '7 days'
      END
    ORDER BY sj.created_at DESC
    LIMIT GREATEST(1, LEAST(p_limit, 1000))
    OFFSET GREATEST(0, p_offset);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_sync_jobs(text, int, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_sync_jobs(text, int, int) TO authenticated;

COMMENT ON FUNCTION public.admin_get_sync_jobs(text, int, int) IS
  'Admin-only. Lista sync_jobs com tenant info. Filtros: active, errors, recent (default 7d), all. RAISES se não-admin.';

-- 4. admin_reset_sync_job_failed_invoices — three-way + estado job (S11+S12)
CREATE OR REPLACE FUNCTION public.admin_reset_sync_job_failed_invoices(p_job_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int := 0;
  v_job_status text;
BEGIN
  IF NOT public.is_admin_global(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas admins' USING ERRCODE = '42501';
  END IF;

  -- S11: ressuscitar items de um job terminal acorda workers para um job
  -- morto. Bloquear excepto em estados activos.
  SELECT status INTO v_job_status FROM public.sync_jobs WHERE id = p_job_id;
  IF v_job_status IS NULL THEN
    RAISE EXCEPTION 'Sync job não encontrado' USING ERRCODE = '02000';
  END IF;
  IF v_job_status IN ('cancelled', 'error') THEN
    RAISE EXCEPTION 'Não é possível re-tentar items de job em estado %. Cria um sync_job novo.', v_job_status
      USING ERRCODE = '22023';
  END IF;

  -- S12: three-way em vez de duas. confidence_score é setado pelo
  -- analyze-document quando o Gemini responde — distingue "extracted que
  -- falhou no finalize" (re-tentar Drive/Sheets, sem custo Gemini) de
  -- "analyzing que nunca chegou ao Gemini" (precisa correr análise).
  WITH updated AS (
    UPDATE public.invoices
       SET status = CASE
                      WHEN storage_path IS NOT NULL AND storage_path <> ''
                           AND confidence_score IS NOT NULL THEN 'extracted'
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
    PERFORM public.refresh_sync_job_counts(p_job_id);
    -- Acorda workers — fetch para 'discovered', analyze para 'analyzing',
    -- finalize para 'extracted'. Watchdog cobre o que ficar para trás.
    PERFORM public.trigger_sync_worker('fetch-attachments', '{}'::jsonb);
    PERFORM public.trigger_sync_worker('analyze-batch', '{}'::jsonb);
    PERFORM public.trigger_sync_worker('finalize-batch', '{}'::jsonb);
  END IF;

  RETURN v_count;
END;
$$;
