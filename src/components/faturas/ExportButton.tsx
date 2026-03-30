import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase/client';
import { useI18n } from '@/contexts/I18nContext';
import type { FaturasFilterState } from './FaturasFilters';
import type { Invoice } from '@/types/database';

interface ExportButtonProps {
  filters: FaturasFilterState;
  companyId: string | null;
}

function formatDateDD(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

async function fetchAllFiltered(filters: FaturasFilterState, companyId: string | null): Promise<Invoice[]> {
  let query = supabase
    .from('invoices')
    .select('*')
    .is('deleted_at', null)
    .order('doc_date', { ascending: false });

  if (companyId) query = query.eq('company_id', companyId);
  if (filters.search) query = query.ilike('supplier_name', `%${filters.search}%`);
  if (filters.year) query = query.eq('doc_year', parseInt(filters.year));
  if (filters.metier) query = query.eq('metier', filters.metier);
  if (filters.nature) query = query.eq('nature_depense', filters.nature);
  if (filters.costType) query = query.eq('cost_type', filters.costType);

  const { data, error } = await query;
  if (error) throw error;
  return data as Invoice[];
}

function buildWorkbook(invoices: Invoice[]): XLSX.WorkBook {
  const rows = invoices.map((inv) => ({
    'Date': formatDateDD(inv.doc_date),
    'N\u00b0 Facture': inv.doc_number ?? '',
    'Fournisseur': inv.supplier_name ?? '',
    'M\u00e9tier': inv.metier ?? '',
    'Nature': inv.nature_depense ?? '',
    'Type co\u00fbt': inv.cost_type === 'cout_fixe' ? 'Fixe' : inv.cost_type === 'cout_variable' ? 'Variable' : '',
    'HT': inv.montant_ht ?? '',
    'TVA': inv.montant_tva ?? '',
    'TTC': inv.montant_ttc ?? '',
    'Taux TVA': inv.taux_tva != null ? `${inv.taux_tva}%` : '',
    'R\u00e9sum\u00e9': inv.summary ?? '',
    'Lien PDF': inv.drive_link ?? inv.file_url ?? '',
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Factures');
  return wb;
}

export function ExportButton({ filters, companyId }: ExportButtonProps) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    try {
      const invoices = await fetchAllFiltered(filters, companyId);
      const wb = buildWorkbook(invoices);
      const today = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `factures_export_${today}.xlsx`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={loading}
      className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      {loading ? t('action.exporting') : t('action.export_excel')}
    </button>
  );
}
