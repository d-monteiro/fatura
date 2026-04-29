import { driveLimiter } from '@/lib/rateLimiter';
import { getTokenInfo } from './client';

// DEPRECATED sob concorrência: check-then-create não é atómico e o Drive
// permite pastas duplicadas com o mesmo nome no mesmo parent. O backend usa
// `ensureFolderPath` (supabase/functions/_shared/driveFolders.ts) que serializa
// via tabela `drive_folders`. O upload manual no frontend ainda usa este path;
// para reduzir a exposição, o search abaixo pede `orderBy=createdTime` (devolve
// o mais antigo em duplicados legacy em vez de aleatório) — mas não elimina o
// race entre uploads simultâneos.
export async function ensureFolder(
  accessToken: string,
  folderName: string,
  parentId: string | null = null,
): Promise<string> {
  if (!accessToken) throw new Error('Token de acesso não fornecido para criar pasta');

  await driveLimiter.waitForSlot();

  const safeName = folderName.replace(/'/g, "\\'");
  let query = `mimeType='application/vnd.google-apps.folder' and name='${safeName}' and trashed=false`;
  query += parentId ? ` and '${parentId}' in parents` : ` and 'root' in parents`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);

  const searchResponse = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,createdTime)&orderBy=createdTime`,
    { headers: { Authorization: `Bearer ${accessToken}` }, signal: controller.signal },
  );

  clearTimeout(timeoutId);

  if (!searchResponse.ok) {
    const errorText = await searchResponse.text();
    if (searchResponse.status === 403 && errorText.includes('SCOPE_INSUFFICIENT')) {
      const tokenInfo = await getTokenInfo(accessToken);
      const scopesMsg = tokenInfo?.scopes?.join(', ') || 'não foi possível verificar';
      throw new Error(
        `Permissões insuficientes no Google Drive. ` +
        `Scopes atuais: [${scopesMsg}]. ` +
        `Por favor, vá a https://myaccount.google.com/permissions, remova o acesso desta app, e reconecte a conta.`,
      );
    }
    throw new Error(`Erro ao procurar pasta: ${searchResponse.status} - ${errorText}`);
  }

  const searchData = await searchResponse.json();
  if (searchData.error) throw new Error(`Erro da API Google: ${searchData.error.message}`);
  if (searchData.files && searchData.files.length > 0) return searchData.files[0].id;

  const createResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentId ? [parentId] : undefined,
    }),
  });

  if (!createResponse.ok) {
    const error = await createResponse.text();
    throw new Error(`Erro ao criar pasta: ${createResponse.status} - ${error}`);
  }

  const createData = await createResponse.json();
  if (createData.error) throw new Error(`Erro ao criar pasta: ${createData.error.message}`);
  if (!createData.id) throw new Error('Pasta criada mas sem ID retornado');

  return createData.id;
}
