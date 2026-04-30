import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase/client';
import { useI18n } from '@/contexts/I18nContext';
import type { FaturasFilterState } from './FaturasFilters';
import { NO_SUPPLIER_VALUE } from './SupplierCombobox';
import { computeDateRange } from '@/lib/faturas/dateRange';
import { buildInvoiceExtractWorkbook } from '@/lib/exports/invoiceExtract';
import type { Invoice } from '@/types/database';

interface ExportButtonProps {
  filters: FaturasFilterState;
  companyId: string | null;
}

async function fetchAllFiltered(filters: FaturasFilterState, companyId: string | null): Promise<Invoice[]> {
  let query = supabase
    .from('invoices')
    .select('*')
    .is('deleted_at', null)
    .order('doc_date', { ascending: false });

  if (companyId) query = query.eq('company_id', companyId);
  if (filters.search) query = query.ilike('supplier_name', `%${filters.search}%`);

  const { start, end } = computeDateRange(filters);
  if (start) query = query.gte('doc_date', start);
  if (end) query = query.lte('doc_date', end);

  if (filters.supplierId === NO_SUPPLIER_VALUE) {
    query = query.is('supplier_id', null);
  } else if (filters.supplierId) {
    query = query.eq('supplier_id', filters.supplierId);
  }

  if (filters.category) query = query.eq('category', filters.category);

  const { data, error } = await query;
  if (error) throw error;
  return data as Invoice[];
}

export function ExportButton({ filters, companyId }: ExportButtonProps) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    try {
      const invoices = await fetchAllFiltered(filters, companyId);
      const wb = buildInvoiceExtractWorkbook(invoices, { title: 'Extracto de Faturas' });
      const today = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `faturas_export_${today}.xlsx`);
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
