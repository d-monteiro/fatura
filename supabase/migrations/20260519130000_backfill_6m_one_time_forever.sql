-- =============================================================================
-- backfill_6m — rate-limit "one-time forever" (apenas 'done' bloqueia)
-- =============================================================================
-- A janela 24h original (migration 20260504120000) era defesa contra curl
-- abuse, não política de produto. Decisão: o backfill é one-time por empresa.
-- Bloqueia apenas se já houve um backfill_6m com status='done' (sucesso) —
-- tentativas em error/cancelled deixam re-tentar para não trancar o user em
-- caso de bug nosso.
-- =============================================================================

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

  IF p_trigger NOT IN ('manual', 'backfill_6m') THEN
    RAISE EXCEPTION 'Trigger inválido: %', p_trigger USING ERRCODE = '22023';
  END IF;

  IF NOT (p_tenant_id IN (SELECT public.get_user_tenant_ids())) THEN
    RAISE EXCEPTION 'Sem permissão para este tenant' USING ERRCODE = '42501';
  END IF;

  -- One-time forever: bloqueia se já existe um backfill_6m concluído.
  -- Error/cancelled não bloqueiam (permite retry quando falha técnica).
  IF p_trigger = 'backfill_6m' THEN
    IF EXISTS (
      SELECT 1 FROM public.sync_jobs
       WHERE tenant_id = p_tenant_id
         AND trigger = 'backfill_6m'
         AND status = 'done'
    ) THEN
      RAISE EXCEPTION 'Esta empresa já fez a importação inicial de 6 meses'
        USING ERRCODE = '22023',
              HINT = 'A importação é uma acção única por empresa.';
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
    v_date_from := (now() - interval '180 days');
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

COMMENT ON FUNCTION public.start_sync_job(uuid, text, uuid) IS
  'User-scoped. Cria sync_job manual (7d) ou backfill_6m (180d). backfill_6m é one-time forever: bloqueado se já existe backfill_6m com status=done para o tenant.';
