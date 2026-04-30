// Helper único para gerar Excel de extracto de faturas.
// Mesmo template usado por:
//  - ExportButton (xlsx só, todas as filtradas)
//  - ZipExportButton (resumo dentro do ZIP com PDFs)
// E alinhado em colunas/headers com o EXTRATO_<ano> em Google Sheets.
//
// Mudanças de template tocam SÓ aqui — ExportButton e ZipExportButton herdam.

import * as XLSX from 'xlsx';
import type { Invoice } from '@/types/database';

// PT-PT. Mesma ordem das HEADERS_BY_LANG.pt em src/lib/google/sheets.ts —
// excepto "Data Processamento" que aqui usamos para a data de export local
// em vez da hora de sync.
export const INVOICE_EXTRACT_HEADERS = [
  'Data Doc.',
  'Fornecedor',
  'NIF',
  'Categoria',
  'Nº Documento',
  'Valor s/ IVA',
  'IVA',
  'Valor Total',
  'Taxa IVA',
  'Resumo',
  'Link PDF',
  'Data Export',
] as const;

const COL_WIDTHS: number[] = [12, 28, 12, 18, 16, 14, 12, 14, 10, 40, 32, 14];

function formatDatePT(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

export interface InvoiceExtractRow {
  data: string;
  fornecedor: string;
  nif: string;
  categoria: string;
  numero: string;
  valor_sem_iva: number | '';
  iva: number | '';
  valor_total: number | '';
  taxa_iva: string;
  resumo: string;
  link_pdf: string;
  data_export: string;
}

export function buildInvoiceExtractRow(inv: Invoice, exportDate: string): InvoiceExtractRow {
  return {
    data: formatDatePT(inv.doc_date),
    fornecedor: inv.supplier_name ?? '',
    nif: inv.supplier_nif ?? '',
    categoria: inv.category ?? '',
    numero: inv.doc_number ?? '',
    valor_sem_iva: inv.valor_sem_iva ?? '',
    iva: inv.valor_iva ?? '',
    valor_total: inv.valor_total ?? '',
    taxa_iva: inv.taxa_iva != null ? `${inv.taxa_iva}%` : '',
    resumo: inv.summary ?? '',
    link_pdf: inv.drive_link ?? inv.file_url ?? '',
    data_export: exportDate,
  };
}

interface BuildOptions {
  // Título mostrado na primeira linha (merge A1:L1). Se omitido, sem título.
  title?: string;
  // Nome da aba. Default "Faturas".
  sheetName?: string;
}

// Constrói um worksheet com:
//  - Linha 1 (opcional): título merged A1:L1.
//  - Linha de header com nomes das colunas.
//  - Linhas de dados.
//  - Linha "Total" no fim com SUM das colunas numéricas.
//  - Column widths fixos + freeze pane na linha de header.
export function buildInvoiceExtractWorkbook(
  invoices: Invoice[],
  options: BuildOptions = {},
): XLSX.WorkBook {
  const today = formatDatePT(new Date().toISOString());
  const rows = invoices.map((inv) => buildInvoiceExtractRow(inv, today));

  const aoa: (string | number)[][] = [];
  const titleRow = options.title ? 1 : 0;
  if (options.title) {
    aoa.push([options.title, ...Array(INVOICE_EXTRACT_HEADERS.length - 1).fill('')]);
  }
  aoa.push([...INVOICE_EXTRACT_HEADERS]);

  const dataStart = aoa.length + 1; // 1-based row of first data row
  for (const r of rows) {
    aoa.push([
      r.data,
      r.fornecedor,
      r.nif,
      r.categoria,
      r.numero,
      r.valor_sem_iva,
      r.iva,
      r.valor_total,
      r.taxa_iva,
      r.resumo,
      r.link_pdf,
      r.data_export,
    ]);
  }
  const dataEnd = aoa.length; // 1-based last data row

  // Linha de totais com formulas (vazia se não há faturas).
  if (rows.length > 0) {
    const sumRange = (col: string) => `SUM(${col}${dataStart}:${col}${dataEnd})`;
    aoa.push([
      'Total', '', '', '', '',
      { f: sumRange('F') } as unknown as number,
      { f: sumRange('G') } as unknown as number,
      { f: sumRange('H') } as unknown as number,
      '', '', '', '',
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  ws['!cols'] = COL_WIDTHS.map((w) => ({ wch: w }));

  if (options.title) {
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: INVOICE_EXTRACT_HEADERS.length - 1 } }];
  }

  // Freeze: mantém o título e o header sempre visíveis.
  ws['!freeze'] = { xSplit: 0, ySplit: titleRow + 1 };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, options.sheetName ?? 'Faturas');
  return wb;
}
