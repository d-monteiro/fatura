// Google Drive REST API. Porta do frontend (src/lib/google/drive.ts).
// Remove deps browser-only (errorReporter). Usa FormData/Blob globais (Deno ≥1.11).
import { driveLimiter } from "./rateLimiter.ts";
import { setupSpreadsheetHeaders, getMonthSheetName } from "./sheets.ts";

const DRIVE_TIMEOUT_MS = 30_000;
const DRIVE_UPLOAD_TIMEOUT_MS = 120_000;

function timeoutSignal(ms: number) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(id) };
}

export async function ensureFolder(
  accessToken: string,
  folderName: string,
  parentId: string | null = null,
): Promise<string> {
  if (!accessToken) throw new Error('Token de acesso em falta');
  await driveLimiter.waitForSlot();
  const safeName = folderName.replace(/'/g, "\\'");
  let query = `mimeType='application/vnd.google-apps.folder' and name='${safeName}' and trashed=false`;
  if (parentId) query += ` and '${parentId}' in parents`;

  const t1 = timeoutSignal(DRIVE_TIMEOUT_MS);
  const searchResponse = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`,
    { headers: { Authorization: `Bearer ${accessToken}` }, signal: t1.signal },
  );
  t1.clear();
  if (!searchResponse.ok) {
    const txt = await searchResponse.text();
    throw new Error(`Drive search ${searchResponse.status}: ${txt.slice(0, 200)}`);
  }
  const searchData = await searchResponse.json();
  if (searchData.files && searchData.files.length > 0) return searchData.files[0].id;

  await driveLimiter.waitForSlot();
  const t2 = timeoutSignal(DRIVE_TIMEOUT_MS);
  const createResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentId ? [parentId] : undefined,
    }),
    signal: t2.signal,
  });
  t2.clear();
  if (!createResponse.ok) {
    const txt = await createResponse.text();
    throw new Error(`Drive folder create ${createResponse.status}: ${txt.slice(0, 200)}`);
  }
  const createData = await createResponse.json();
  if (!createData.id) throw new Error('Pasta criada sem ID');
  return createData.id;
}

export async function checkFileExists(
  accessToken: string,
  fileName: string,
  parentId: string,
): Promise<string | null> {
  await driveLimiter.waitForSlot();
  const safeFileName = fileName.replace(/'/g, "\\'");
  const query = `name='${safeFileName}' and '${parentId}' in parents and trashed=false`;
  const t = timeoutSignal(DRIVE_TIMEOUT_MS);
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`,
    { headers: { Authorization: `Bearer ${accessToken}` }, signal: t.signal },
  );
  t.clear();
  if (!response.ok) throw new Error(`Drive check ${response.status}`);
  const data = await response.json();
  return data.files && data.files.length > 0 ? data.files[0].id : null;
}

export async function fileExistsById(
  accessToken: string, fileId: string,
): Promise<boolean> {
  await driveLimiter.waitForSlot();
  const t = timeoutSignal(DRIVE_TIMEOUT_MS);
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,trashed`,
    { headers: { Authorization: `Bearer ${accessToken}` }, signal: t.signal },
  );
  t.clear();
  if (!response.ok) return false;
  const data = await response.json();
  return !!data.id && !data.trashed;
}

export async function createNewSpreadsheet(
  accessToken: string,
  title: string,
  parentFolderId: string,
  language = 'pt',
): Promise<{ id: string; webViewLink: string }> {
  const sheets = Array.from({ length: 12 }, (_, i) => getMonthSheetName(i, language));
  await driveLimiter.waitForSlot();
  const ct = timeoutSignal(DRIVE_TIMEOUT_MS);
  const createResponse = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      properties: { title },
      sheets: sheets.map((name) => ({ properties: { title: name } })),
    }),
    signal: ct.signal,
  });
  ct.clear();
  if (!createResponse.ok) {
    const err = await createResponse.text();
    throw new Error(`Spreadsheet create ${createResponse.status}: ${err.slice(0, 200)}`);
  }
  const createData = await createResponse.json();
  const spreadsheetId = createData.spreadsheetId;

  await setupSpreadsheetHeaders(accessToken, spreadsheetId, language);

  try {
    await driveLimiter.waitForSlot();
    const mt = timeoutSignal(DRIVE_TIMEOUT_MS);
    const moveResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${spreadsheetId}?addParents=${parentFolderId}&fields=id,parents,webViewLink`,
      { method: 'PATCH', headers: { Authorization: `Bearer ${accessToken}` }, signal: mt.signal },
    );
    mt.clear();
    if (moveResponse.ok) {
      const moveData = await moveResponse.json();
      return {
        id: spreadsheetId,
        webViewLink: moveData.webViewLink || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
      };
    }
  } catch (err) {
    // Sheet criada com sucesso; move failure só deixa o ficheiro na raiz do Drive.
    console.warn(`[drive] move_sheet_to_folder failed spreadsheet=${spreadsheetId}`, err instanceof Error ? err.message : err);
  }

  return {
    id: spreadsheetId,
    webViewLink: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
  };
}

export async function getOrCreateYearlySheet(
  accessToken: string,
  year: number,
  parentFolderId: string,
  language = 'pt',
): Promise<string> {
  const extractoName = `EXTRATO_${year}`;
  const existingId = await checkFileExists(accessToken, extractoName, parentFolderId);
  if (existingId) return existingId;
  const newSheet = await createNewSpreadsheet(accessToken, extractoName, parentFolderId, language);
  return newSheet.id;
}

export async function uploadInvoiceToDrive(
  accessToken: string,
  fileData: Uint8Array,
  fileName: string,
  parentFolderId: string,
  mimeType = 'application/pdf',
): Promise<{ id: string; webViewLink: string }> {
  if (!accessToken) throw new Error('Token em falta');
  if (!parentFolderId) throw new Error('parentFolderId em falta');

  const metadata = { name: fileName, parents: [parentFolderId], mimeType };
  const blob = new Blob([new Uint8Array(fileData)], { type: mimeType });

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', blob);

  await driveLimiter.waitForSlot();
  const ut = timeoutSignal(DRIVE_UPLOAD_TIMEOUT_MS);
  const response = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
      signal: ut.signal,
    },
  );
  ut.clear();
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Drive upload ${response.status}: ${err.slice(0, 200)}`);
  }
  const result = await response.json();
  if (!result.id) throw new Error('Upload sem ID');
  return {
    id: result.id,
    webViewLink: result.webViewLink || `https://drive.google.com/file/d/${result.id}/view`,
  };
}
