-- Fix: trigger precisa ser SECURITY DEFINER para conseguir inserir em audit_log
-- (audit_log RLS bloqueia INSERT para authenticated; só tem SELECT + service bypass).
-- Além disso, o ator deve ser dinâmico: auth.uid() do utilizador que está
-- a executar a ação, e não o user_id "dono" da fatura.

CREATE OR REPLACE FUNCTION public.log_invoice_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_id UUID := auth.uid();
BEGIN
  IF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_log (tenant_id, user_id, table_name, record_id, action, old_values, new_values)
    VALUES (
      NEW.tenant_id,
      COALESCE(actor_id, NEW.user_id),
      'invoices',
      NEW.id,
      CASE WHEN OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN 'delete'
           WHEN OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN 'restore'
           WHEN OLD.status = 'review' AND NEW.status = 'processed' THEN 'approve'
           ELSE 'update' END,
      to_jsonb(OLD),
      to_jsonb(NEW)
    );
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log (tenant_id, user_id, table_name, record_id, action, new_values)
    VALUES (
      NEW.tenant_id,
      COALESCE(actor_id, NEW.user_id),
      'invoices',
      NEW.id,
      'create',
      to_jsonb(NEW)
    );
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_log (tenant_id, user_id, table_name, record_id, action, old_values)
    VALUES (
      OLD.tenant_id,
      COALESCE(actor_id, OLD.user_id),
      'invoices',
      OLD.id,
      'hard_delete',
      to_jsonb(OLD)
    );
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.log_invoice_changes() FROM PUBLIC;
