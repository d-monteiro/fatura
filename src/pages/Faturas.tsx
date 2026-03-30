import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { useI18n } from '@/contexts/I18nContext';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCompanyFilter } from '@/hooks/useCompanyFilter';
import { useBulkActions } from '@/hooks/useBulkActions';
import { FaturasFilters, type FaturasFilterState } from '@/components/faturas/FaturasFilters';
import { FaturasTable, type SortField, type SortDir } from '@/components/faturas/FaturasTable';
import { ExportButton } from '@/components/faturas/ExportButton';
import { BulkActionBar } from '@/components/faturas/BulkActionBar';
import { InvoiceDetailDrawer } from '@/components/faturas/InvoiceDetailDrawer';
import { InvoiceEditModal } from '@/components/faturas/InvoiceEditModal';
import type { Invoice } from '@/types/database';

const PAGE_SIZE = 20;

export default function Faturas() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { companyId } = useCompanyFilter();

  const [filters, setFilters] = useState<FaturasFilterState>({
    search: '', year: '', month: '', metier: '', nature: '', costType: '',
  });
  const [sortField, setSortField] = useState<SortField>('doc_date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(0);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editInvoice, setEditInvoice] = useState<Invoice | null>(null);

  const bulk = useBulkActions();

  const { data, isLoading } = useQuery({
    queryKey: ['faturas', companyId, filters, sortField, sortDir, page],
    queryFn: async () => {
      let query = supabase
        .from('invoices')
        .select('*', { count: 'exact' })
        .is('deleted_at', null)
        .order(sortField, { ascending: sortDir === 'asc' })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (companyId) query = query.eq('company_id', companyId);
      if (filters.search) query = query.ilike('supplier_name', `%${filters.search}%`);
      if (filters.year) query = query.eq('doc_year', parseInt(filters.year));
      if (filters.metier) query = query.eq('metier', filters.metier);
      if (filters.nature) query = query.eq('nature_depense', filters.nature);
      if (filters.costType) query = query.eq('cost_type', filters.costType);

      const { data: rows, count, error } = await query;
      if (error) throw error;
      return { invoices: rows as Invoice[], total: count ?? 0 };
    },
  });

  const softDelete = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('invoices')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      setDrawerOpen(false);
      setSelectedInvoice(null);
      queryClient.invalidateQueries({ queryKey: ['faturas'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] });
      queryClient.invalidateQueries({ queryKey: ['recent-invoices'] });
    },
  });

  const handleSort = (field: SortField) => {
    if (field === sortField) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
    setPage(0);
  };

  const handleRowClick = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setDrawerOpen(true);
  };

  const handleEdit = useCallback((invoice: Invoice) => {
    setDrawerOpen(false);
    setEditInvoice(invoice);
  }, []);

  const invoices = data?.invoices ?? [];
  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">{t('nav.invoices')}</h1>
        <ExportButton filters={filters} companyId={companyId} />
      </div>

      <FaturasFilters filters={filters} onChange={(f) => { setFilters(f); setPage(0); }} />

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-gray-100" />
          ))}
        </div>
      ) : (
        <>
          <FaturasTable
            invoices={invoices}
            sortField={sortField}
            sortDir={sortDir}
            onSort={handleSort}
            onRowClick={handleRowClick}
            selectedIds={bulk.selectedIds}
            onToggleSelect={bulk.toggleSelect}
            onToggleAll={() => bulk.toggleAll(invoices)}
          />
          {totalPages > 1 && (
            <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-between">
              <p className="text-xs text-gray-500 sm:text-sm">
                {data!.total} factures &middot; Page {page + 1}/{totalPages}
              </p>
              <div className="flex gap-2">
                <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}
                  className="inline-flex min-h-[44px] items-center gap-1 rounded-lg border border-gray-300 px-4 py-2 text-sm disabled:opacity-40 sm:min-h-0 sm:py-1.5">
                  <ChevronLeft className="h-4 w-4" /> Prec.
                </button>
                <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1}
                  className="inline-flex min-h-[44px] items-center gap-1 rounded-lg border border-gray-300 px-4 py-2 text-sm disabled:opacity-40 sm:min-h-0 sm:py-1.5">
                  Suiv. <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <InvoiceDetailDrawer
        invoice={selectedInvoice}
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setSelectedInvoice(null); }}
        onEdit={handleEdit}
        onDelete={(id) => softDelete.mutate(id)}
      />
      {editInvoice && (
        <InvoiceEditModal invoice={editInvoice} open={!!editInvoice} onClose={() => setEditInvoice(null)} />
      )}
      {bulk.selectedIds.size > 0 && (
        <BulkActionBar
          count={bulk.selectedIds.size}
          onApprove={() => bulk.bulkApprove.mutate([...bulk.selectedIds])}
          onDelete={() => bulk.bulkDelete.mutate([...bulk.selectedIds])}
          onClear={bulk.clearSelection}
          loading={bulk.bulkLoading}
        />
      )}
    </div>
  );
}
