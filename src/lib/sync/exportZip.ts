import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import type { Invoice } from '@/types/database';

const MONTH_NAMES = [
  '', 'Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
] as const;
// Sem diacrítico propositalmente — evita encodings partidos em ZIP entries antigos.

function folderForInvoice(inv: Invoice): string {
  if (!inv.doc_date) return 'Sem data';
  const d = new Date(inv.doc_date);
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const mm = String(month).padStart(2, '0');
  return `${year}/${mm} - ${MONTH_NAMES[month]}`;
}

function buildSummaryWorkbook(invoices: Invoice[]): ArrayBuffer {
  const rows = invoices.map((inv) => ({
    Data: inv.doc_date ?? '',
    'Nº Fatura': inv.doc_number ?? '',
    Fornecedor: inv.supplier_name ?? '',
    Categoria: inv.category ?? '',
    'Valor s/IVA': inv.valor_sem_iva ?? '',
    IVA: inv.valor_iva ?? '',
    'Valor Total': inv.valor_total ?? '',
    'Taxa IVA': inv.taxa_iva != null ? `${inv.taxa_iva}%` : '',
    Resumo: inv.summary ?? '',
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Faturas');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

export async function exportInvoicesToZip(
  invoices: Invoice[],
  accessToken: string,
): Promise<void> {
  if (!invoices.length) {
    toast.error('Sem faturas para exportar');
    return;
  }

  const zip = new JSZip();
  toast.info(`A preparar ${invoices.length} faturas...`);

  let ok = 0;
  let fail = 0;
  const BATCH = 5;

  for (let i = 0; i < invoices.length; i += BATCH) {
    const batch = invoices.slice(i, i + BATCH);
    await Promise.all(batch.map(async (inv) => {
      if (!inv.drive_file_id) { fail++; return; }
      try {
        const res = await fetch(
          `https://www.googleapis.com/drive/v3/files/${inv.drive_file_id}?alt=media`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const folder = folderForInvoice(inv);
        const supplier = (inv.supplier_name ?? 'desconhecido').replace(/[/\\?%*:|"<>]/g, '_');
        const amount = (inv.valor_total ?? 0).toFixed(2);
        const name = `${inv.doc_date ?? 'sd'}_${supplier}_${amount}.pdf`;
        zip.file(`${folder}/${name}`, blob);
        ok++;
      } catch { fail++; }
    }));
  }

  // Add Excel summary
  const xlsxBuf = buildSummaryWorkbook(invoices);
  zip.file('resumo_faturas.xlsx', xlsxBuf);

  if (ok === 0 && fail > 0) {
    toast.error('Não foi possível descarregar os ficheiros.');
    return;
  }

  const content = await zip.generateAsync({ type: 'blob' });
  const today = new Date().toISOString().slice(0, 10);
  saveAs(content, `faturas_export_${today}.zip`);

  if (fail > 0) {
    toast.warning(`Exportação: ${ok} OK, ${fail} falhada(s).`);
  } else {
    toast.success(`${ok} fatura(s) exportada(s) com sucesso!`);
  }
}
