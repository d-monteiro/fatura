/**
 * GOOGLE SHEETS REST API - FR
 * Extrato mensal: EXTRAIT_{ANNEE} > 01_Janvier ... 12_Décembre
 */

import { sheetsLimiter } from '@/lib/rateLimiter';

const SHEETS_TIMEOUT_MS = 30_000;

function createTimeoutSignal(ms: number): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timeoutId) };
}

export const MONTH_SHEET_NAMES = [
  '01_Janvier', '02_Février', '03_Mars', '04_Avril',
  '05_Mai', '06_Juin', '07_Juillet', '08_Août',
  '09_Septembre', '10_Octobre', '11_Novembre', '12_Décembre',
];

const HEADERS = [
  'Date Doc.', 'Fournisseur', 'SIRET', 'Métier', 'Nature',
  'Type Coût', 'N° Document', 'Montant HT (€)', 'TVA (€)',
  'Montant TTC (€)', 'Taux TVA', 'Résumé', 'Lien PDF', 'Date Traitement'
];

export async function appendInvoiceToSheet(
  accessToken: string,
  spreadsheetId: string,
  data: {
    doc_date: string | null;
    supplier_name: string | null;
    supplier_siret: string | null;
    metier: string | null;
    nature_depense: string | null;
    cost_type: string | null;
    doc_number: string | null;
    montant_ht: number | null;
    montant_tva: number | null;
    montant_ttc: number | null;
    taux_tva: number | null;
    summary: string | null;
    drive_link: string | null;
  }
): Promise<void> {
  let sheetName = MONTH_SHEET_NAMES[0];

  if (data.doc_date) {
    try {
      const date = new Date(data.doc_date);
      if (!isNaN(date.getTime())) {
        const month = date.getMonth();
        if (month >= 0 && month < 12) {
          sheetName = MONTH_SHEET_NAMES[month];
        }
      }
    } catch { /* fallback */ }
  }

  await ensureSheetHasHeader(accessToken, spreadsheetId, sheetName);

  const row = [
    data.doc_date || '',
    data.supplier_name || '',
    data.supplier_siret || '',
    data.metier || '',
    data.nature_depense || '',
    data.cost_type || '',
    data.doc_number || '',
    data.montant_ht || 0,
    data.montant_tva || 0,
    data.montant_ttc || 0,
    data.taux_tva ? `${data.taux_tva}%` : '',
    data.summary || '',
    data.drive_link || '',
    new Date().toISOString().split('T')[0],
  ];

  const range = `'${sheetName}'!A2:N`;

  await sheetsLimiter.waitForSlot();
  const t = createTimeoutSignal(SHEETS_TIMEOUT_MS);
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values: [row] }),
      signal: t.signal,
    }
  );
  t.clear();

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Erreur écriture Sheets: ${response.status} - ${error}`);
  }
}

async function ensureSheetHasHeader(
  accessToken: string,
  spreadsheetId: string,
  sheetName: string
): Promise<void> {
  try {
    const metaResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!metaResponse.ok) return;

    const metaData = await metaResponse.json();
    const sheetExists = metaData.sheets?.some(
      (s: { properties: { title: string } }) => s.properties.title === sheetName
    );

    if (!sheetExists) {
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ requests: [{ addSheet: { properties: { title: sheetName } } }] }),
        }
      );
    }

    const checkResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${sheetName}'!A1:N1`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!checkResponse.ok) return;

    const checkData = await checkResponse.json();
    const existingRow = checkData.values?.[0] || [];

    if (existingRow.length === 0 || existingRow[0] !== HEADERS[0]) {
      const metaResponse2 = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const metaData2 = await metaResponse2.json();
      const sheet = metaData2.sheets?.find(
        (s: { properties: { title: string } }) => s.properties.title === sheetName
      );
      if (!sheet) return;
      const sheetId = sheet.properties.sheetId;

      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requests: [{
              updateCells: {
                range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: HEADERS.length },
                rows: [{
                  values: HEADERS.map(h => ({
                    userEnteredValue: { stringValue: h },
                    userEnteredFormat: {
                      backgroundColor: { red: 0.13, green: 0.17, blue: 0.26 },
                      textFormat: { bold: true, fontSize: 10, foregroundColor: { red: 1, green: 1, blue: 1 } },
                      horizontalAlignment: 'CENTER',
                    }
                  }))
                }],
                fields: 'userEnteredValue,userEnteredFormat'
              }
            }, {
              updateSheetProperties: {
                properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
                fields: 'gridProperties.frozenRowCount'
              }
            }]
          }),
        }
      );
    }
  } catch { /* silently fail */ }
}

export async function setupSpreadsheetHeaders(
  accessToken: string,
  spreadsheetId: string
): Promise<void> {
  for (const sheetName of MONTH_SHEET_NAMES) {
    await ensureSheetHasHeader(accessToken, spreadsheetId, sheetName);
  }
}
