// Google Sheets REST API — extrato anual com aba por mês. Porta do frontend.
import { sheetsLimiter } from "./rateLimiter.ts";
import { getMonthName } from "./months.ts";

const SHEETS_TIMEOUT_MS = 30_000;
const COLUMN_COUNT = 12;

function timeoutSignal(ms: number) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(id) };
}

const HEADERS_BY_LANG: Record<string, string[]> = {
  pt: ['Data Doc.', 'Fornecedor', 'NIF', 'Categoria', 'Nº Documento', 'Valor s/ IVA', 'IVA', 'Valor Total', 'Taxa IVA', 'Resumo', 'Link PDF', 'Data Processamento'],
  en: ['Doc Date', 'Supplier', 'Tax ID', 'Category', 'Doc Number', 'Net Amount', 'VAT', 'Gross Amount', 'VAT Rate', 'Summary', 'PDF Link', 'Processed At'],
};

export function getSheetHeaders(language: string): string[] {
  return HEADERS_BY_LANG[language] ?? HEADERS_BY_LANG.pt;
}

export function getMonthSheetName(monthIndex: number, language = 'pt'): string {
  return `${String(monthIndex + 1).padStart(2, '0')}_${getMonthName(monthIndex, language)}`;
}

export interface AppendRowData {
  doc_date: string | null;
  supplier_name: string | null;
  supplier_nif: string | null;
  category: string | null;
  doc_number: string | null;
  valor_sem_iva: number | null;
  valor_iva: number | null;
  valor_total: number | null;
  taxa_iva: number | null;
  summary: string | null;
  drive_link: string | null;
}

export async function appendInvoiceToSheet(
  accessToken: string,
  spreadsheetId: string,
  data: AppendRowData,
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
    data.category || '',
    data.doc_number || '',
    data.valor_sem_iva ?? 0,
    data.valor_iva ?? 0,
    data.valor_total ?? 0,
    data.taxa_iva ? `${data.taxa_iva}%` : '',
    data.summary || '',
    data.drive_link || '',
    new Date().toISOString().split('T')[0],
  ];

  const range = `'${sheetName}'!A2:L`;
  await sheetsLimiter.waitForSlot();
  const t = timeoutSignal(SHEETS_TIMEOUT_MS);
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [row] }),
      signal: t.signal,
    },
  );
  t.clear();
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Sheets append ${response.status}: ${error.slice(0, 200)}`);
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
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!metaResponse.ok) return;
  const metaData = await metaResponse.json();
  const sheetExists = metaData.sheets?.some(
    (s: { properties: { title: string } }) => s.properties.title === sheetName,
  );
  if (!sheetExists) {
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests: [{ addSheet: { properties: { title: sheetName } } }] }),
      },
    );
  }
  const checkResponse = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${sheetName}'!A1:L1`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!checkResponse.ok) return;
  const checkData = await checkResponse.json();
  const existingRow = checkData.values?.[0] || [];
  if (existingRow.length === 0 || existingRow[0] !== headers[0]) {
    const metaResponse2 = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const metaData2 = await metaResponse2.json();
    const sheet = metaData2.sheets?.find(
      (s: { properties: { title: string } }) => s.properties.title === sheetName,
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
                values: headers.map((h) => ({
                  userEnteredValue: { stringValue: h },
                  userEnteredFormat: {
                    backgroundColor: { red: 0.13, green: 0.17, blue: 0.26 },
                    textFormat: { bold: true, fontSize: 10, foregroundColor: { red: 1, green: 1, blue: 1 } },
                    horizontalAlignment: 'CENTER',
                  },
                })),
              }],
              fields: 'userEnteredValue,userEnteredFormat',
            },
          }, {
            updateSheetProperties: {
              properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
              fields: 'gridProperties.frozenRowCount',
            },
          }],
        }),
      },
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
