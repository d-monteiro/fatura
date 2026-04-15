import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import type { Invoice } from '@/types/database';

const MONTH_NAMES = [
  '', 'Janvier', 'Fevrier', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Aout', 'Septembre', 'Octobre', 'Novembre', 'Decembre',
];

function folderForInvoice(inv: Invoice): string {
  if (!inv.doc_date) return 'Sans date';
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
    Categoria: inv.metier ?? '',
    Natureza: inv.nature_depense ?? '',
    'Tipo custo': inv.cost_type === 'cout_fixe' ? 'Fixo' : inv.cost_type === 'cout_variable' ? 'Variável' : '',
    'Valor s/IVA': inv.montant_ht ?? '',
    IVA: inv.montant_tva ?? '',
    'Valor c/IVA': inv.montant_ttc ?? '',
    'Taxa IVA': inv.taux_tva != null ? `${inv.taux_tva}%` : '',
    Resumo: inv.summary ?? '',
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Factures');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

export async function exportInvoicesToZip(
  invoices: Invoice[],
  accessToken: string,
): Promise<void> {
  if (!invoices.length) {
    toast.error('Aucune facture a exporter');
    return;
  }

  const zip = new JSZip();
  toast.info(`Preparation de ${invoices.length} factures...`);

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
        const supplier = (inv.supplier_name ?? 'inconnu').replace(/[/\\?%*:|"<>]/g, '_');
        const amount = (inv.montant_ttc ?? 0).toFixed(2);
        const name = `${inv.doc_date ?? 'nd'}_${supplier}_${amount}.pdf`;
        zip.file(`${folder}/${name}`, blob);
        ok++;
      } catch { fail++; }
    }));
  }

  // Add Excel summary
  const xlsxBuf = buildSummaryWorkbook(invoices);
  zip.file('resume_factures.xlsx', xlsxBuf);

  if (ok === 0 && fail > 0) {
    toast.error('Impossible de telecharger les fichiers.');
    return;
  }

  const content = await zip.generateAsync({ type: 'blob' });
  const today = new Date().toISOString().slice(0, 10);
  saveAs(content, `factures_export_${today}.zip`);

  if (fail > 0) {
    toast.warning(`Export: ${ok} OK, ${fail} echoue(s).`);
  } else {
    toast.success(`${ok} factures exportees avec succes!`);
  }
}
