/**
 * Google Sheets REST API — extrato anual com aba por mês.
 * Headers e nomes de meses são determinados pelo idioma do tenant.
 */

import { sheetsLimiter } from '@/lib/rateLimiter';
import { getMonthName } from '@/lib/utils/months';

const SHEETS_TIMEOUT_MS = 30_000;
const COLUMN_COUNT = 14;

// Mapeamento campo → índice de coluna (0-based), alinhado com HEADERS_BY_LANG.
// A ordem tem de coincidir com a construção da row em appendInvoiceToSheet.
export const INVOICE_COLUMN_MAP = {
  doc_date: 0,         // A
  supplier_name: 1,    // B
  supplier_nif: 2,     // C
  metier: 3,           // D
  nature_depense: 4,   // E
  cost_type: 5,        // F
  doc_number: 6,       // G
  montant_ht: 7,       // H
  montant_tva: 8,      // I
  montant_ttc: 9,      // J
  taux_tva: 10,        // K (formatada como "23%")
  summary: 11,         // L
  drive_link: 12,      // M
  // N (processed_date) não é editável.
} as const;

export type InvoiceSheetField = keyof typeof INVOICE_COLUMN_MAP;

function createTimeoutSignal(ms: number): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timeoutId) };
}

const HEADERS_BY_LANG: Record<string, string[]> = {
  pt: ['Data Doc.', 'Fornecedor', 'NIF', 'Categoria', 'Natureza', 'Tipo Custo', 'Nº Documento', 'Valor s/ IVA', 'IVA', 'Valor c/ IVA', 'Taxa IVA', 'Resumo', 'Link PDF', 'Data Processamento'],
  en: ['Doc Date', 'Supplier', 'Tax ID', 'Category', 'Nature', 'Cost Type', 'Doc Number', 'Net Amount', 'VAT', 'Gross Amount', 'VAT Rate', 'Summary', 'PDF Link', 'Processed At'],
};

function getSheetHeaders(language: string): string[] {
  return HEADERS_BY_LANG[language] ?? HEADERS_BY_LANG.pt;
}

export function getMonthSheetName(monthIndex: number, language = 'pt'): string {
  return `${String(monthIndex + 1).padStart(2, '0')}_${getMonthName(monthIndex, language)}`;
}

export async function appendInvoiceToSheet(
  accessToken: string,
  spreadsheetId: string,
  data: {
    doc_date: string | null;
    supplier_name: string | null;
    supplier_nif: string | null;
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
  },
  language = 'pt',
): Promise<void> {
  const headers = getSheetHeaders(language);
  let monthIdx = 0;
  if (data.doc_date) {
    const d = new Date(data.doc_date);
    if (!isNaN(d.getTime())) monthIdx = d.getMonth();
  }
  const sheetName = getMonthSheetName(monthIdx, language);

  await ensureSheetHasHeader(accessToken, spreadsheetId, sheetName, headers);

  const row = [
    data.doc_date || '',
    data.supplier_name || '',
    data.supplier_nif || '',
    data.metier || '',
    data.nature_depense || '',
    data.cost_type || '',
    data.doc_number || '',
    data.montant_ht ?? 0,
    data.montant_tva ?? 0,
    data.montant_ttc ?? 0,
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
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [row] }),
      signal: t.signal,
    }
  );
  t.clear();

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Erro ao escrever no Sheets: ${response.status} - ${error}`);
  }
}

async function ensureSheetHasHeader(
  accessToken: string,
  spreadsheetId: string,
  sheetName: string,
  headers: string[],
): Promise<void> {
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

  if (existingRow.length === 0 || existingRow[0] !== headers[0]) {
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
              range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: COLUMN_COUNT },
              rows: [{
                values: headers.map(h => ({
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
}

export async function setupSpreadsheetHeaders(
  accessToken: string,
  spreadsheetId: string,
  language = 'pt',
): Promise<void> {
  const headers = getSheetHeaders(language);
  for (let i = 0; i < 12; i++) {
    await ensureSheetHasHeader(accessToken, spreadsheetId, getMonthSheetName(i, language), headers);
  }
}

function columnIndexToLetter(index: number): string {
  let n = index + 1;
  let letter = '';
  while (n > 0) {
    n--;
    letter = String.fromCharCode((n % 26) + 65) + letter;
    n = Math.floor(n / 26);
  }
  return letter;
}

export interface InvoiceSheetLocator {
  doc_number?: string | null;
  supplier_name?: string | null;
  montant_ttc?: number | null;
  doc_date?: string | null;
}

/**
 * Localiza a linha (1-indexed, excluindo header) de uma fatura dentro de uma aba.
 * 3 estratégias em cascata: doc_number, supplier+total, supplier+data.
 */
export async function findInvoiceRowIndex(
  accessToken: string,
  spreadsheetId: string,
  sheetName: string,
  criteria: InvoiceSheetLocator,
): Promise<number | null> {
  await sheetsLimiter.waitForSlot();
  const t = createTimeoutSignal(SHEETS_TIMEOUT_MS);
  const lastLetter = columnIndexToLetter(COLUMN_COUNT - 1);
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`'${sheetName}'!A2:${lastLetter}2000`)}`,
    { headers: { Authorization: `Bearer ${accessToken}` }, signal: t.signal },
  );
  t.clear();
  if (!response.ok) return null;

  const data = await response.json();
  const rows: string[][] = data.values || [];
  if (!rows.length) return null;

  // Estratégia 1: doc_number (mais fiável).
  const targetDoc = criteria.doc_number?.toString().trim();
  if (targetDoc) {
    const idx = rows.findIndex(r => r[INVOICE_COLUMN_MAP.doc_number]?.toString().trim() === targetDoc);
    if (idx !== -1) return idx + 2;
  }

  // Estratégia 2: supplier + montant_ttc (tolerância 0.01).
  const targetSupplier = criteria.supplier_name?.toString().trim().toLowerCase();
  if (targetSupplier && criteria.montant_ttc != null) {
    const idx = rows.findIndex(r => {
      const s = r[INVOICE_COLUMN_MAP.supplier_name]?.toString().trim().toLowerCase();
      const amt = parseFloat((r[INVOICE_COLUMN_MAP.montant_ttc] ?? '0').toString().replace(',', '.'));
      return s === targetSupplier && Math.abs(amt - (criteria.montant_ttc ?? 0)) < 0.01;
    });
    if (idx !== -1) return idx + 2;
  }

  // Estratégia 3: supplier + doc_date.
  if (targetSupplier && criteria.doc_date) {
    const idx = rows.findIndex(r => {
      const s = r[INVOICE_COLUMN_MAP.supplier_name]?.toString().trim().toLowerCase();
      const d = r[INVOICE_COLUMN_MAP.doc_date]?.toString().trim();
      return s === targetSupplier && d === criteria.doc_date;
    });
    if (idx !== -1) return idx + 2;
  }

  return null;
}

export type InvoiceRowUpdates = Partial<{
  doc_date: string | null;
  supplier_name: string | null;
  supplier_nif: string | null;
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
}>;

/**
 * Escreve campos alterados numa linha existente via batchUpdate.
 * Devolve false se a API rejeitar — caller trata como warning.
 */
export async function updateInvoiceRowInSheet(
  accessToken: string,
  spreadsheetId: string,
  sheetName: string,
  rowIndex: number,
  updates: InvoiceRowUpdates,
): Promise<boolean> {
  const data: Array<{ range: string; values: Array<Array<string | number>> }> = [];
  for (const [field, value] of Object.entries(updates) as [InvoiceSheetField, unknown][]) {
    if (value === undefined) continue;
    const colIdx = INVOICE_COLUMN_MAP[field];
    if (colIdx === undefined) continue;
    const cell = formatCellValue(field, value);
    data.push({
      range: `'${sheetName}'!${columnIndexToLetter(colIdx)}${rowIndex}`,
      values: [[cell]],
    });
  }
  if (!data.length) return true;

  await sheetsLimiter.waitForSlot();
  const t = createTimeoutSignal(SHEETS_TIMEOUT_MS);
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data }),
      signal: t.signal,
    },
  );
  t.clear();
  return response.ok;
}

function formatCellValue(field: InvoiceSheetField, value: unknown): string | number {
  if (value == null) return '';
  if (field === 'taux_tva' && typeof value === 'number') return `${value}%`;
  if (typeof value === 'number') return value;
  return String(value);
}
