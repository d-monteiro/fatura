-- error_logs: permitir INSERT a partir do frontend (authenticated + anon)
-- A tabela só tinha policies de SELECT/UPDATE — todos os inserts do errorReporter
-- eram silenciosamente bloqueados pelo RLS (catch engolia o 403), e a tabela ficava vazia.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'error_logs') THEN
    EXECUTE 'DROP POLICY IF EXISTS "insert_frontend_errors" ON error_logs';
    EXECUTE $policy$
      CREATE POLICY "insert_frontend_errors" ON error_logs
        FOR INSERT
        TO authenticated, anon
        WITH CHECK (
          source = 'frontend'
          AND (user_id IS NULL OR user_id = (select auth.uid()))
        )
    $policy$;
  END IF;
END $$;
