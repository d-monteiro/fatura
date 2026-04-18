import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase/client';
import { useI18n } from '@/contexts/I18nContext';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCompanyFilter } from '@/hooks/useCompanyFilter';
import { useTenant } from '@/contexts/TenantContext';
import { useBulkActions } from '@/hooks/useBulkActions';
import { FaturasFilters, type FaturasFilterState } from '@/components/faturas/FaturasFilters';
import { FaturasTable, type SortField, type SortDir } from '@/components/faturas/FaturasTable';
import { ExportButton } from '@/components/faturas/ExportButton';
import { ZipExportButton } from '@/components/faturas/ZipExportButton';
import { BulkActionBar } from '@/components/faturas/BulkActionBar';
import { InvoiceDetailDrawer } from '@/components/faturas/InvoiceDetailDrawer';
import { cn } from '@/lib/cn';
import type { Invoice } from '@/types/database';
import { queryKeys } from '@/lib/queryKeys';
import { escapeLike } from '@/lib/utils/queries';

const PAGE_SIZE = 20;

type StatusTab = 'review' | 'all' | 'processed';

const TAB_STATUSES: Record<StatusTab, string[] | null> = {
  review: ['inbox', 'review'],
  all: null,
  processed: ['processed'],
};

function parseTab(value: string | null): StatusTab {
  return value === 'review' || value === 'processed' ? value : 'all';
}

export default function Faturas() {
  const { t } = useI18n();
  const { companyId } = useCompanyFilter();
  const { tenant } = useTenant();
  const tenantId = tenant?.id ?? null;
  const [searchParams, setSearchParams] = useSearchParams();

  const tab = parseTab(searchParams.get('tab'));

  const [filters, setFilters] = useState<FaturasFilterState>({
    search: '', year: '', month: '', metier: '', nature: '', costType: '',
  });
  const [sortField, setSortField] = useState<SortField>('doc_date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(0);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const bulk = useBulkActions();

  const setTab = (next: StatusTab) => {
    setSearchParams((prev) => {
      if (next === 'all') prev.delete('tab'); else prev.set('tab', next);
      return prev;
    });
    setPage(0);
    bulk.clearSelection();
  };

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.faturasList(companyId, filters, sortField, sortDir, page, tab),
    queryFn: async () => {
      if (!tenantId) return { invoices: [], total: 0 };
      let query = supabase
        .from('invoices')
        .select('*', { count: 'exact' })
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .order(sortField, { ascending: sortDir === 'asc' })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      const statuses = TAB_STATUSES[tab];
      if (statuses) query = query.in('status', statuses);
      if (companyId) query = query.eq('company_id', companyId);
      if (filters.search) query = query.ilike('supplier_name', `%${escapeLike(filters.search)}%`);
      if (filters.year) query = query.eq('doc_year', parseInt(filters.year));
      if (filters.metier) query = query.eq('metier', filters.metier);
      if (filters.nature) query = query.eq('nature_depense', filters.nature);
      if (filters.costType) query = query.eq('cost_type', filters.costType);

      const { data: rows, count, error } = await query;
      if (error) throw error;
      return { invoices: rows as Invoice[], total: count ?? 0 };
    },
    enabled: !!tenantId,
  });

  const { data: counts } = useQuery({
    queryKey: ['invoice-tab-counts', tenantId, companyId],
    queryFn: async () => {
      if (!tenantId) return null;
      const base = () => {
        let q = supabase.from('invoices').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).is('deleted_at', null);
        if (companyId) q = q.eq('company_id', companyId);
        return q;
      };
      const [{ count: review }, { count: all }, { count: processed }] = await Promise.all([
        base().in('status', TAB_STATUSES.review as string[]),
        base(),
        base().in('status', TAB_STATUSES.processed as string[]),
      ]);
      return { review: review ?? 0, all: all ?? 0, processed: processed ?? 0 };
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

  const invoices = data?.invoices ?? [];
  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;

  const tabs: { key: StatusTab; label: string; count: number }[] = [
    { key: 'review', label: t('fat.tab_review'), count: counts?.review ?? 0 },
    { key: 'all', label: t('fat.tab_all'), count: counts?.all ?? 0 },
    { key: 'processed', label: t('fat.tab_processed'), count: counts?.processed ?? 0 },
  ];

  return (
    <div className="animate-fade-in space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">{t('nav.invoices')}</h1>
        <div className="flex gap-2">
          <ZipExportButton invoices={invoices} />
          <ExportButton filters={filters} companyId={companyId} />
        </div>
      </div>

      <div className="flex gap-1 rounded-xl border border-gray-200 bg-white p-1 shadow-sm w-fit">
        {tabs.map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
              tab === key
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-gray-600 hover:bg-gray-50',
            )}
          >
            {label}
            <span
              className={cn(
                'inline-flex min-w-[1.5rem] justify-center rounded-full px-1.5 text-xs',
                tab === key ? 'bg-white/20' : 'bg-gray-100 text-gray-600',
              )}
            >
              {count}
            </span>
          </button>
        ))}
      </div>

      <FaturasFilters filters={filters} onChange={(f) => { setFilters(f); setPage(0); }} tenantId={tenantId} />

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
                {data!.total} {t('nav.invoices').toLowerCase()} &middot; {page + 1}/{totalPages}
              </p>
              <div className="flex gap-2">
                <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}
                  className="inline-flex min-h-[44px] items-center gap-1 rounded-lg border border-gray-300 px-4 py-2 text-sm disabled:opacity-40 sm:min-h-0 sm:py-1.5">
                  <ChevronLeft className="h-4 w-4" /> {t('pag.prev')}
                </button>
                <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1}
                  className="inline-flex min-h-[44px] items-center gap-1 rounded-lg border border-gray-300 px-4 py-2 text-sm disabled:opacity-40 sm:min-h-0 sm:py-1.5">
                  {t('pag.next')} <ChevronRight className="h-4 w-4" />
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
      />

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
