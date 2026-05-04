-- PLAN_HARDENING Fase 8: circuit breaker para serviços externos (Gemini, Drive)
-- 3 falhas em 60s → state='open' por 5min → probe via 'half_open'.
-- Workers consultam circuit_breaker_check antes de pegar batch.

CREATE TABLE IF NOT EXISTS public.circuit_breakers (
  service text PRIMARY KEY,
  state text NOT NULL DEFAULT 'closed'
    CHECK (state IN ('closed', 'open', 'half_open')),
  failure_count int NOT NULL DEFAULT 0,
  failure_window_start timestamptz,
  opened_at timestamptz,
  expires_at timestamptz,
  last_failure_reason text,
  threshold_failures int NOT NULL DEFAULT 3,
  threshold_window_seconds int NOT NULL DEFAULT 60,
  cooldown_seconds int NOT NULL DEFAULT 300,
  trip_count int NOT NULL DEFAULT 0,
  last_tripped_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.circuit_breakers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cb_admin_read ON public.circuit_breakers;
CREATE POLICY cb_admin_read ON public.circuit_breakers
  FOR SELECT TO authenticated
  USING (public.is_admin_global());

INSERT INTO public.circuit_breakers (service)
  VALUES ('gemini'), ('drive')
  ON CONFLICT (service) DO NOTHING;

-- Devolve TRUE se o tráfego é permitido (closed ou half_open).
-- Em transição automática open→half_open quando expires_at passou.
CREATE OR REPLACE FUNCTION public.circuit_breaker_check(p_service text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  cb RECORD;
BEGIN
  SELECT * INTO cb FROM public.circuit_breakers WHERE service = p_service FOR UPDATE;
  IF NOT FOUND THEN
    RETURN true;
  END IF;

  IF cb.state = 'open' AND cb.expires_at IS NOT NULL AND cb.expires_at < now() THEN
    UPDATE public.circuit_breakers
       SET state = 'half_open',
           failure_count = 0,
           failure_window_start = NULL,
           updated_at = now()
     WHERE service = p_service;
    RETURN true;
  END IF;

  RETURN cb.state IN ('closed', 'half_open');
END;
$$;

-- Regista falha. Se threshold (default 3) excedido em window (60s) → trip.
-- Devolve estado actualizado em jsonb (para logging do worker).
CREATE OR REPLACE FUNCTION public.circuit_breaker_record_failure(
  p_service text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  cb RECORD;
  v_window_start timestamptz;
  v_count int;
BEGIN
  SELECT * INTO cb FROM public.circuit_breakers WHERE service = p_service FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.circuit_breakers (service, failure_count, failure_window_start, last_failure_reason)
      VALUES (p_service, 1, now(), left(coalesce(p_reason, ''), 200))
      RETURNING * INTO cb;
    RETURN to_jsonb(cb);
  END IF;

  IF cb.failure_window_start IS NULL OR
     cb.failure_window_start < now() - make_interval(secs => cb.threshold_window_seconds) THEN
    v_window_start := now();
    v_count := 1;
  ELSE
    v_window_start := cb.failure_window_start;
    v_count := cb.failure_count + 1;
  END IF;

  IF v_count >= cb.threshold_failures THEN
    UPDATE public.circuit_breakers
       SET state = 'open',
           failure_count = v_count,
           failure_window_start = v_window_start,
           opened_at = now(),
           expires_at = now() + make_interval(secs => cb.cooldown_seconds),
           last_failure_reason = left(coalesce(p_reason, ''), 200),
           trip_count = cb.trip_count + 1,
           last_tripped_at = now(),
           updated_at = now()
     WHERE service = p_service
     RETURNING * INTO cb;
  ELSE
    UPDATE public.circuit_breakers
       SET failure_count = v_count,
           failure_window_start = v_window_start,
           last_failure_reason = left(coalesce(p_reason, ''), 200),
           updated_at = now()
     WHERE service = p_service
     RETURNING * INTO cb;
  END IF;

  RETURN to_jsonb(cb);
END;
$$;

-- Sucesso fecha o breaker (sai de half_open ou força close se algo o abriu).
CREATE OR REPLACE FUNCTION public.circuit_breaker_record_success(p_service text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  UPDATE public.circuit_breakers
     SET state = 'closed',
         failure_count = 0,
         failure_window_start = NULL,
         opened_at = NULL,
         expires_at = NULL,
         updated_at = now()
   WHERE service = p_service AND state IN ('half_open', 'open');
END;
$$;

REVOKE ALL ON FUNCTION public.circuit_breaker_check(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.circuit_breaker_record_failure(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.circuit_breaker_record_success(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.circuit_breaker_check(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.circuit_breaker_record_failure(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.circuit_breaker_record_success(text) TO service_role;
