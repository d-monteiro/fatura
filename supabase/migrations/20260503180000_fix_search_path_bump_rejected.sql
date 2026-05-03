-- Patch advisor: invoices_bump_sync_run_rejected sem SET search_path (warning
-- function_search_path_mutable). Mesma função, com search_path explícito.
CREATE OR REPLACE FUNCTION public.invoices_bump_sync_run_rejected()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  was_rejected boolean := (TG_OP = 'UPDATE'
    AND OLD.deleted_at IS NOT NULL
    AND OLD.status <> 'cancelled');
  is_rejected boolean := (NEW.deleted_at IS NOT NULL
    AND NEW.status <> 'cancelled');
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
