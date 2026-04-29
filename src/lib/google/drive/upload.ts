import { driveLimiter } from '@/lib/rateLimiter';
import { DRIVE_UPLOAD_TIMEOUT_MS, createTimeoutSignal } from './client';

export async function uploadInvoiceToDrive(
  accessToken: string,
  fileData: Uint8Array | Blob,
  fileName: string,
  parentFolderId: string,
  mimeType: string = 'application/pdf',
): Promise<{ id: string; webViewLink: string; webContentLink: string }> {
  if (!accessToken) throw new Error('Token de acesso não fornecido para upload');
  if (!parentFolderId) throw new Error('ID da pasta de destino não fornecido');

  const metadata = { name: fileName, parents: [parentFolderId], mimeType };

  const blob = fileData instanceof Blob
    ? fileData
    : new Blob([new Uint8Array(fileData)], { type: mimeType });

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', blob);

  await driveLimiter.waitForSlot();
  const ut = createTimeoutSignal(DRIVE_UPLOAD_TIMEOUT_MS);
  const response = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink,webContentLink',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
      signal: ut.signal,
    },
  );
  ut.clear();

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Upload falhou: ${response.status} - ${error}`);
  }

  const result = await response.json();
  if (result.error) throw new Error(`Erro no upload: ${result.error.message}`);
  if (!result.id) throw new Error('Ficheiro enviado mas sem ID retornado');

  return {
    id: result.id,
    webViewLink: result.webViewLink || `https://drive.google.com/file/d/${result.id}/view`,
    webContentLink: result.webContentLink || '',
  };
}
