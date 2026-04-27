-- Bucket privado para SAF-T exports. URL assinada temporária é a única
-- forma de acesso pelo cliente; service_role (Edge Function) faz o upload.

INSERT INTO storage.buckets (id, name, public)
VALUES ('saft-exports', 'saft-exports', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "service_role_saft_exports" ON storage.objects;
CREATE POLICY "service_role_saft_exports"
  ON storage.objects FOR ALL TO service_role
  USING (bucket_id = 'saft-exports')
  WITH CHECK (bucket_id = 'saft-exports');

-- O path segue o formato {tenant_id}/... -- restringimos SELECT ao
-- tenant-owner (mesmo que na prática só se aceda via signed URL).
DROP POLICY IF EXISTS "members_read_own_saft_exports" ON storage.objects;
CREATE POLICY "members_read_own_saft_exports"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'saft-exports'
    AND (storage.foldername(name))[1]::uuid IN (SELECT get_user_tenant_ids())
  );
