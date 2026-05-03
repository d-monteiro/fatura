-- =============================================================================
-- PLAN_HARDENING.md Fase 1 — Hardening review (correcções pós code review)
-- =============================================================================
-- Resolve 4 críticos (C1, C2, C3, parte de S1) + 5 sérios (S1 trigger,
-- S2, S3, S4, S5) + nits (N1, N2, N9) à migration 20260503120000.
-- Idempotente: pode ser re-aplicada.
-- =============================================================================

-- C1. RLS bypass aberto a public em sync_jobs E sync_runs ---------------------
-- A policy "Service role bypass" tinha TO public USING(true) WITH CHECK(true) —
-- abria INSERT/UPDATE/DELETE a authenticated/anon. service_role bypassa RLS
-- por defeito (atributo BYPASSRLS), portanto a policy é redundante para o role
-- que devia proteger. As writers_* policies em sync_runs são suficientes;
-- em sync_jobs, ausência de policy de escrita = deny by default (correcto:
-- users criam jobs via Edge Function, nunca direct).
DROP POLICY IF EXISTS "Service role bypass" ON public.sync_jobs;
DROP POLICY IF EXISTS "Service role bypass" ON public.sync_runs;

-- S2. Trigger de heartbeat magic gaslighta o watchdog -------------------------
-- O trigger BEFORE UPDATE bumpava last_heartbeat_at em qualquer UPDATE,
-- incluindo updates do próprio watchdog cron — fazia jobs presos parecerem
-- vivos. Workers passam a fazer UPDATE explícito do heartbeat (Phase 2+).
DROP TRIGGER IF EXISTS trg_sync_jobs_heartbeat ON public.sync_jobs;
DROP FUNCTION IF EXISTS public.sync_jobs_touch_heartbeat();

-- S3. Realtime publication de sync_jobs contradiz D5 (polling) ----------------
-- Plano D5: "Polling de 5s no front, não Realtime". Cada UPDATE de heartbeat
-- emitia row event WebSocket sem ninguém subscrito. Phase 7 que adicione se
-- decidir mudar D5.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='sync_jobs'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.sync_jobs;
  END IF;
END $$;

-- S5 + N2. Index pickup recomposto + tie-breaker ------------------------------
-- Antes: (status, locked_until, next_retry_at) sem created_at => sort externo.
-- Sem attempts no partial => varre items à beira de failed_permanent que nunca
-- seriam pickupable. now() não é imutável => filtros de locked_until/next_retry_at
-- ficam em runtime (executor), não no partial.
DROP INDEX IF EXISTS public.idx_invoices_worker_pickup;
CREATE INDEX idx_invoices_worker_pickup
  ON public.invoices (status, created_at, id)
  WHERE deleted_at IS NULL
    AND attempts < 3
    AND status IN ('discovered','fetching','analyzing','extracted');

-- C2 + C3 + N9. pick_invoices_for_processing recriada -------------------------
-- Mudanças:
--  - SEM bump de attempts no pick. Worker death = lock expira (ok), attempts
--    NÃO é queimado. Bump fica responsabilidade do worker em falha logical.
--  - ORDER BY created_at, id (tie-breaker estável em concorrência).
--  - SECURITY INVOKER (era DEFINER sem motivo; service_role bypassa RLS).
DROP FUNCTION IF EXISTS public.pick_invoices_for_processing(text, int, int);

CREATE FUNCTION public.pick_invoices_for_processing(
  p_status text,
  p_limit int DEFAULT 5,
  p_lock_seconds int DEFAULT 90
)
RETURNS SETOF public.invoices
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  WITH picked AS (
    SELECT id
    FROM public.invoices
    WHERE status = p_status
      AND deleted_at IS NULL
      AND (locked_until IS NULL OR locked_until < now())
      AND (next_retry_at IS NULL OR next_retry_at < now())
      AND attempts < 3
    ORDER BY created_at, id
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.invoices
     SET locked_until = now() + (p_lock_seconds || ' seconds')::interval
   WHERE id IN (SELECT id FROM picked)
  RETURNING *;
$$;

REVOKE ALL ON FUNCTION public.pick_invoices_for_processing(text, int, int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pick_invoices_for_processing(text, int, int) TO service_role;

COMMENT ON FUNCTION public.pick_invoices_for_processing(text, int, int) IS
  'Worker pickup com FOR UPDATE SKIP LOCKED. Marca locked_until apenas. attempts é responsabilidade do worker em falha logical (não em pick), para que worker death não queime budget de retries.';

-- C2. Reset de attempts ao transitar de fase ----------------------------------
-- Worker do happy path passa por 3 pickups (fetch->analyze->finalize). Sem
-- reset, attempts atinge 3 e o guard attempts<3 bloqueia. Trigger garante que
-- mudança de status reseta o contador, sem o worker poder esquecer-se.
CREATE OR REPLACE FUNCTION public.invoices_reset_attempts_on_status_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.attempts := 0;
    NEW.locked_until := NULL;
    NEW.next_retry_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoices_reset_attempts ON public.invoices;
CREATE TRIGGER trg_invoices_reset_attempts
  BEFORE UPDATE OF status ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.invoices_reset_attempts_on_status_change();

-- S4. CHECK constraint em invoices.status -------------------------------------
-- Whitelist alargada: inclui statuses legacy ainda em uso (failed, inbox) e
-- os novos do plano. Statuses legacy serão consolidados em Phase 2-3.
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_status_check
  CHECK (status IN (
    -- legacy (statuses actualmente em produção):
    'inbox','analyzing','review','failed',
    -- novos do plano hardening:
    'discovered','fetching','extracted','completed',
    'rejected','duplicate','failed_permanent','cancelled'
  ));

-- S1. invoices.sync_run_id ----------------------------------------------------
-- Necessário para o trigger de total_rejected manter sync_runs.total_rejected
-- fresco. Populated pelo sync-email no INSERT.
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS sync_run_id uuid REFERENCES public.sync_runs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_sync_run_id
  ON public.invoices (sync_run_id) WHERE sync_run_id IS NOT NULL;

COMMENT ON COLUMN public.invoices.sync_run_id IS
  'Sync run que descobriu este invoice. Populado pelo sync-email no INSERT. NULL para uploads manuais.';

-- S1. Trigger que mantém sync_runs.total_rejected fresco ----------------------
-- Antes: sync-email gravava total_rejected = 0 no fim do discovery (Gemini
-- ainda nem correu). Agora: o número actualiza-se em real-time conforme
-- analyze-document marca invoices como rejeitadas (deleted_at + review_reason).
-- Critério: deleted_at IS NOT NULL é o que define "rejeitado" na UI hoje.
CREATE OR REPLACE FUNCTION public.invoices_bump_sync_run_rejected()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  was_rejected boolean := (TG_OP = 'UPDATE' AND OLD.deleted_at IS NOT NULL);
  is_rejected  boolean := NEW.deleted_at IS NOT NULL;
  delta int := 0;
BEGIN
  IF NEW.sync_run_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF is_rejected THEN delta := 1; END IF;
  ELSE
    IF is_rejected AND NOT was_rejected THEN delta := 1;
    ELSIF was_rejected AND NOT is_rejected THEN delta := -1;
    END IF;
  END IF;

  IF delta <> 0 THEN
    UPDATE public.sync_runs
       SET total_rejected = GREATEST(total_rejected + delta, 0)
     WHERE id = NEW.sync_run_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoices_bump_rejected ON public.invoices;
CREATE TRIGGER trg_invoices_bump_rejected
  AFTER INSERT OR UPDATE OF deleted_at ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.invoices_bump_sync_run_rejected();

COMMENT ON FUNCTION public.invoices_bump_sync_run_rejected() IS
  'Mantém sync_runs.total_rejected actualizado conforme invoices são marcadas/desmarcadas como rejeitadas (deleted_at). Substitui o hardcoded total_rejected:0 que o sync-email punha antes da análise correr.';
