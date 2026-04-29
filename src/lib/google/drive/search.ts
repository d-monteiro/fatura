import { driveLimiter } from '@/lib/rateLimiter';
import { DRIVE_TIMEOUT_MS, createTimeoutSignal } from './client';

export async function checkFileExists(
  accessToken: string,
  fileName: string,
  parentId: string,
): Promise<string | null> {
  await driveLimiter.waitForSlot();
  const safeFileName = fileName.replace(/'/g, "\\'");
  const query = `name='${safeFileName}' and '${parentId}' in parents and trashed=false`;
  const t = createTimeoutSignal(DRIVE_TIMEOUT_MS);
  // orderBy=createdTime: se o bug antigo deixou duplicados, adoptamos o mais
  // antigo (o que `ensureFolderPath` do backend também escolhe) — comportamento
  // consistente entre pipelines.
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,createdTime)&orderBy=createdTime`,
    { headers: { Authorization: `Bearer ${accessToken}` }, signal: t.signal },
  );
  t.clear();

  if (!response.ok) throw new Error(`Erro ao verificar ficheiro: ${response.status}`);

  const data = await response.json();
  return data.files && data.files.length > 0 ? data.files[0].id : null;
}
