import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/client';
import { useI18n } from '@/contexts/I18nContext';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCompanyFilter } from '@/hooks/useCompanyFilter';
import { useTenant } from '@/contexts/TenantContext';
import { useBulkActions } from '@/hooks/useBulkActions';
import { useInvoicesRealtime } from '@/hooks/useInvoicesRealtime';
import { FaturasFilters, type FaturasFilterState } from '@/components/faturas/FaturasFilters';
import { NO_SUPPLIER_VALUE } from '@/components/faturas/SupplierCombobox';
import { computeDateRange } from '@/lib/faturas/dateRange';
import { FaturasTable, type SortField, type SortDir } from '@/components/faturas/FaturasTable';
import { IgnoradasTable } from '@/components/faturas/IgnoradasTable';
import { ExportButton } from '@/components/faturas/ExportButton';
import { ZipExportButton } from '@/components/faturas/ZipExportButton';
import { SaftExportDialog } from '@/components/faturas/SaftExportDialog';
import { FileArchive } from 'lucide-react';
import { BulkActionBar } from '@/components/faturas/BulkActionBar';
import { InvoiceDetailDrawer } from '@/components/faturas/InvoiceDetailDrawer';
import { cn } from '@/lib/cn';
import type { Invoice } from '@/types/database';
import { queryKeys, invalidateInvoiceLists } from '@/lib/queryKeys';
import { escapeLike } from '@/lib/utils/queries';

const PAGE_SIZE = 20;
const IGNORED_DAYS = 30;

type Tab = 'active' | 'ignored';

function parseTab(value: string | null): Tab {
  return value === 'ignored' ? 'ignored' : 'active';
}

export default function Faturas() {
  const { t } = useI18n();
  const { companyId } = useCompanyFilter();
  const { tenant } = useTenant();
  const tenantId = tenant?.id ?? null;
  const [searchParams, setSearchParams] = useSearchParams();
  const qc = useQueryClient();

  useInvoicesRealtime(tenantId);

  const tab = parseTab(searchParams.get('tab'));

  const [filters, setFilters] = useState<FaturasFilterState>({
    search: '', year: '', month: '', dateStart: '', dateEnd: '', supplierId: '',
    category: '',
  });
  const [sortField, setSortField] = useState<SortField>('doc_date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(0);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [recoveringId, setRecoveringId] = useState<string | null>(null);
  const [saftOpen, setSaftOpen] = useState(false);

  const bulk = useBulkActions();

  const setTab = (next: Tab) => {
    setSearchParams((prev) => {
      if (next === 'active') prev.delete('tab'); else prev.set('tab', next);
      return prev;
    });
    setPage(0);
    bulk.clearSelection();
  };

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.faturasList(companyId, filters, sortField, sortDir, page, tab),
    queryFn: async () => {
      if (!tenantId) return { invoices: [], total: 0 };

      if (tab === 'ignored') {
        const since = new Date(Date.now() - IGNORED_DAYS * 24 * 60 * 60 * 1000).toISOString();
        let q = supabase.from('invoices')
          .select('*', { count: 'exact' })
          .eq('tenant_id', tenantId)
          .not('deleted_at', 'is', null)
          .gte('deleted_at', since)
          .order('deleted_at', { ascending: false })
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
        if (companyId) q = q.eq('company_id', companyId);
        const { data: rows, count, error } = await q;
        if (error) throw error;
        return { invoices: rows as Invoice[], total: count ?? 0 };
      }

      let query = supabase
        .from('invoices')
        .select('*', { count: 'exact' })
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .order(sortField, { ascending: sortDir === 'asc', nullsFirst: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (companyId) query = query.eq('company_id', companyId);
      if (filters.search) query = query.ilike('supplier_name', `%${escapeLike(filters.search)}%`);

      const { start, end } = computeDateRange(filters);
      if (start) query = query.gte('doc_date', start);
      if (end) query = query.lte('doc_date', end);

      if (filters.supplierId === NO_SUPPLIER_VALUE) {
        query = query.is('supplier_id', null);
      } else if (filters.supplierId) {
        query = query.eq('supplier_id', filters.supplierId);
      }

      if (filters.category) query = query.eq('category', filters.category);

      const { data: rows, count, error } = await query;
      if (error) throw error;
      return { invoices: rows as Invoice[], total: count ?? 0 };
    },
    enabled: !!tenantId,
  });

  const { data: counts } = useQuery({
    queryKey: queryKeys.invoiceTabCounts(tenantId, companyId),
    queryFn: async () => {
      if (!tenantId) return null;
      const since = new Date(Date.now() - IGNORED_DAYS * 24 * 60 * 60 * 1000).toISOString();
      const base = () => {
        let q = supabase.from('invoices').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId);
        if (companyId) q = q.eq('company_id', companyId);
        return q;
      };
      const [{ count: active }, { count: ignored }] = await Promise.all([
        base().is('deleted_at', null),
        base().not('deleted_at', 'is', null).gte('deleted_at', since),
      ]);
      return { active: active ?? 0, ignored: ignored ?? 0 };
    },
    enabled: !!tenantId,
  });

  const recoverMutation = useMutation({
    mutationFn: async (inv: Invoice) => {
      setRecoveringId(inv.id);
      const { error } = await supabase.from('invoices')
        .update({
          deleted_at: null,
          status: 'review',
          manual_review: true,
          review_reason: 'Recuperada pelo utilizador — verifica os campos',
        }).eq('id', inv.id);
      if (error) {
        if (error.code === '23505') {
          throw new Error('Já existe outra fatura com este mesmo anexo. Remove a outra primeiro.');
        }
        throw new Error(error.message);
      }
    },
    onSuccess: () => {
      invalidateInvoiceLists(qc);
      toast.success('Fatura recuperada. Vê na aba "Faturas" com o aviso de verificação.');
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Erro a recuperar');
    },
    onSettled: () => setRecoveringId(null),
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

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'active', label: 'Faturas', count: counts?.active ?? 0 },
    { key: 'ignored', label: 'Ignoradas', count: counts?.ignored ?? 0 },
  ];

  return (
    <div className="animate-fade-in space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">{t('nav.invoices')}</h1>
        {tab === 'active' && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSaftOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
            >
              <FileArchive className="h-4 w-4" /> SAF-T
            </button>
            <ZipExportButton invoices={invoices} />
            <ExportButton filters={filters} companyId={companyId} />
          </div>
        )}
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

      {tab === 'active' && (
        <FaturasFilters filters={filters} onChange={(f) => { setFilters(f); setPage(0); }} tenantId={tenantId} />
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-gray-100" />
          ))}
        </div>
      ) : tab === 'ignored' ? (
        <IgnoradasTable
          invoices={invoices}
          onRowClick={handleRowClick}
          onRecover={(inv) => recoverMutation.mutate(inv)}
          recoveringId={recoveringId}
        />
      ) : (
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
      )}

      {totalPages > 1 && !isLoading && (
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

      <InvoiceDetailDrawer
        invoice={selectedInvoice}
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setSelectedInvoice(null); }}
      />

      <SaftExportDialog open={saftOpen} onOpenChange={setSaftOpen} />

      {tab === 'active' && bulk.selectedIds.size > 0 && (
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
