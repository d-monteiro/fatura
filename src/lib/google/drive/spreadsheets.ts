import { driveLimiter } from '@/lib/rateLimiter';
import { reportError } from '@/lib/errors/errorReporter';
import { DRIVE_TIMEOUT_MS, createTimeoutSignal } from './client';
import { checkFileExists } from './search';
import { setupSpreadsheetHeaders, getMonthSheetName } from '../sheets';

async function createNewSpreadsheet(
  accessToken: string,
  title: string,
  parentFolderId: string,
  language = 'pt',
): Promise<{ id: string; webViewLink: string }> {
  const sheets = Array.from({ length: 12 }, (_, i) => getMonthSheetName(i, language));

  await driveLimiter.waitForSlot();
  const ct = createTimeoutSignal(DRIVE_TIMEOUT_MS);
  const createResponse = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: { title },
      sheets: sheets.map((name) => ({ properties: { title: name } })),
    }),
    signal: ct.signal,
  });
  ct.clear();

  if (!createResponse.ok) {
    const error = await createResponse.text();
    throw new Error(`Erro ao criar Spreadsheet: ${createResponse.status} - ${error}`);
  }

  const createData = await createResponse.json();
  const spreadsheetId = createData.spreadsheetId;

  await setupSpreadsheetHeaders(accessToken, spreadsheetId, language);

  // Mover para a pasta correta — se falhar, o sheet fica na raiz do Drive (degradação aceitável).
  try {
    await driveLimiter.waitForSlot();
    const mt = createTimeoutSignal(DRIVE_TIMEOUT_MS);
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
    void reportError(err, {
      component: 'google/createNewSpreadsheet/move',
      level: 'warn',
      extra: { spreadsheetId },
    });
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
