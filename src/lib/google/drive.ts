/**
 * GOOGLE DRIVE REST API (Browser-Compatible)
 * Gestao de pastas hierarquicas e upload de ficheiros.
 *
 * Estrutura de pastas:
 *   FATURAS > {ANO} > {TIPO_CUSTO}
 *   Ex: FATURAS > 2026 > Custos Fixos > 2026-03-15_GALP_85.00.pdf
 */

import { driveLimiter } from '@/lib/rateLimiter';

const DRIVE_TIMEOUT_MS = 30_000;     // 30s para operacoes normais
const DRIVE_UPLOAD_TIMEOUT_MS = 120_000; // 2min para uploads

function createTimeoutSignal(ms: number): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timeoutId) };
}

/**
 * Verifica os scopes do token atual
 */
export async function getTokenInfo(accessToken: string): Promise<{ scopes: string[]; email?: string } | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(
      `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${accessToken}`,
      { signal: controller.signal }
    );

    clearTimeout(timeoutId);

    if (!response.ok) return null;
    const data = await response.json();
    return {
      scopes: data.scope?.split(' ') || [],
      email: data.email,
    };
  } catch {
    return null;
  }
}

/**
 * Encontra ou cria uma pasta (com parent opcional)
 */
export async function ensureFolder(
  accessToken: string,
  folderName: string,
  parentId: string | null = null
): Promise<string> {
  if (!accessToken) {
    throw new Error('Token de acesso não fornecido para criar pasta');
  }

  await driveLimiter.waitForSlot();

  let query = `mimeType='application/vnd.google-apps.folder' and name='${folderName}' and trashed=false`;
  if (parentId) {
    query += ` and '${parentId}' in parents`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  const searchResponse = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    }
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
        `Por favor, vá a https://myaccount.google.com/permissions, remova o acesso desta app, e reconecte a conta.`
      );
    }

    throw new Error(`Erro ao procurar pasta: ${searchResponse.status} - ${errorText}`);
  }

  const searchData = await searchResponse.json();

  if (searchData.error) {
    throw new Error(`Erro da API Google: ${searchData.error.message}`);
  }

  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  // Criar pasta
  const createResponse = await fetch(
    'https://www.googleapis.com/drive/v3/files',
    {
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
    }
  );

  if (!createResponse.ok) {
    const error = await createResponse.text();
    throw new Error(`Erro ao criar pasta: ${createResponse.status} - ${error}`);
  }

  const createData = await createResponse.json();

  if (createData.error) {
    throw new Error(`Erro ao criar pasta: ${createData.error.message}`);
  }

  if (!createData.id) {
    throw new Error('Pasta criada mas sem ID retornado');
  }

  return createData.id;
}

/**
 * Move um ficheiro para uma pasta diferente
 */
export async function moveFile(
  accessToken: string,
  fileId: string,
  newParentId: string
): Promise<boolean> {
  try {
    await driveLimiter.waitForSlot();
    const t1 = createTimeoutSignal(DRIVE_TIMEOUT_MS);
    const getResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=parents`,
      { headers: { Authorization: `Bearer ${accessToken}` }, signal: t1.signal }
    );
    t1.clear();

    if (!getResponse.ok) return false;

    const fileData = await getResponse.json();
    const previousParents = fileData.parents?.join(',') || '';

    await driveLimiter.waitForSlot();
    const t2 = createTimeoutSignal(DRIVE_TIMEOUT_MS);
    const moveResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?addParents=${newParentId}&removeParents=${previousParents}`,
      { method: 'PATCH', headers: { Authorization: `Bearer ${accessToken}` }, signal: t2.signal }
    );
    t2.clear();

    return moveResponse.ok;
  } catch {
    return false;
  }
}

/**
 * Verifica se um ficheiro existe numa pasta
 */
export async function checkFileExists(
  accessToken: string,
  fileName: string,
  parentId: string
): Promise<string | null> {
  await driveLimiter.waitForSlot();
  const query = `name='${fileName}' and '${parentId}' in parents and trashed=false`;
  const t = createTimeoutSignal(DRIVE_TIMEOUT_MS);
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`,
    { headers: { Authorization: `Bearer ${accessToken}` }, signal: t.signal }
  );
  t.clear();

  if (!response.ok) {
    throw new Error(`Erro ao verificar ficheiro: ${response.status}`);
  }

  const data = await response.json();
  return data.files && data.files.length > 0 ? data.files[0].id : null;
}

/**
 * Copia um ficheiro
 */
export async function copyFile(
  accessToken: string,
  sourceFileId: string,
  newName: string,
  destinationFolderId: string
): Promise<{ id: string; webViewLink: string } | null> {
  try {
    await driveLimiter.waitForSlot();
    const t = createTimeoutSignal(DRIVE_TIMEOUT_MS);
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${sourceFileId}/copy`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: newName,
          parents: [destinationFolderId],
        }),
        signal: t.signal,
      }
    );
    t.clear();

    if (!response.ok) return null;
    const data = await response.json();

    return {
      id: data.id,
      webViewLink: data.webViewLink || `https://docs.google.com/spreadsheets/d/${data.id}/edit`,
    };
  } catch {
    return null;
  }
}

import { setupSpreadsheetHeaders, MONTH_SHEET_NAMES } from './sheets';

/**
 * Cria um novo Google Sheet com 12 abas mensais
 */
export async function createNewSpreadsheet(
  accessToken: string,
  title: string,
  parentFolderId: string
): Promise<{ id: string; webViewLink: string }> {
  const sheets = MONTH_SHEET_NAMES;


  await driveLimiter.waitForSlot();
  const ct = createTimeoutSignal(DRIVE_TIMEOUT_MS);
  const createResponse = await fetch(
    'https://sheets.googleapis.com/v4/spreadsheets',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: { title },
        sheets: sheets.map(name => ({ properties: { title: name } })),
      }),
      signal: ct.signal,
    }
  );
  ct.clear();

  if (!createResponse.ok) {
    const error = await createResponse.text();
    throw new Error(`Erro ao criar Spreadsheet: ${createResponse.status} - ${error}`);
  }

  const createData = await createResponse.json();
  const spreadsheetId = createData.spreadsheetId;

  await setupSpreadsheetHeaders(accessToken, spreadsheetId);

  // Mover para a pasta correta
  try {
    await driveLimiter.waitForSlot();
    const mt = createTimeoutSignal(DRIVE_TIMEOUT_MS);
    const moveResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${spreadsheetId}?addParents=${parentFolderId}&fields=id,parents,webViewLink`,
      { method: 'PATCH', headers: { Authorization: `Bearer ${accessToken}` }, signal: mt.signal }
    );
    mt.clear();

    if (moveResponse.ok) {
      const moveData = await moveResponse.json();
      return {
        id: spreadsheetId,
        webViewLink: moveData.webViewLink || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
      };
    }
  } catch {
    // Continue without moving
  }

  return {
    id: spreadsheetId,
    webViewLink: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
  };
}

/**
 * Obtem ou cria o Excel anual (EXTRATO_YEAR)
 */
export async function getOrCreateYearlySheet(
  accessToken: string,
  year: number,
  parentFolderId: string
): Promise<string> {
  const extractoName = `EXTRATO_${year}`;
  const existingId = await checkFileExists(accessToken, extractoName, parentFolderId);

  if (existingId) return existingId;

  const newSheet = await createNewSpreadsheet(accessToken, extractoName, parentFolderId);
  return newSheet.id;
}

/**
 * Upload de ficheiro para o Google Drive
 */
export async function uploadInvoiceToDrive(
  accessToken: string,
  fileData: Uint8Array | Blob,
  fileName: string,
  parentFolderId: string,
  mimeType: string = 'application/pdf'
): Promise<{ id: string; webViewLink: string; webContentLink: string }> {
  if (!accessToken) {
    throw new Error('Token de acesso não fornecido para upload');
  }
  if (!parentFolderId) {
    throw new Error('ID da pasta de destino não fornecido');
  }

  const metadata = {
    name: fileName,
    parents: [parentFolderId],
    mimeType,
  };

  let blob: Blob;
  if (fileData instanceof Blob) {
    blob = fileData;
  } else {
    blob = new Blob([new Uint8Array(fileData)], { type: mimeType });
  }

  const form = new FormData();
  form.append(
    'metadata',
    new Blob([JSON.stringify(metadata)], { type: 'application/json' })
  );
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
    }
  );
  ut.clear();

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Upload falhou: ${response.status} - ${error}`);
  }

  const result = await response.json();

  if (result.error) {
    throw new Error(`Erro no upload: ${result.error.message}`);
  }

  if (!result.id) {
    throw new Error('Ficheiro enviado mas sem ID retornado');
  }

  return {
    id: result.id,
    webViewLink: result.webViewLink || `https://drive.google.com/file/d/${result.id}/view`,
    webContentLink: result.webContentLink || '',
  };
}
