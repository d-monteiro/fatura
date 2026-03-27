import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { useI18n } from '@/contexts/I18nContext';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCompanyFilter } from '@/hooks/useCompanyFilter';
import { FaturasFilters, type FaturasFilterState } from '@/components/faturas/FaturasFilters';
import { FaturasTable, type SortField, type SortDir } from '@/components/faturas/FaturasTable';
import type { Invoice } from '@/types/database';

const PAGE_SIZE = 20;

export default function Faturas() {
  const { t } = useI18n();
  const { companyId } = useCompanyFilter();

  const [filters, setFilters] = useState<FaturasFilterState>({
    search: '', year: '', month: '', metier: '', nature: '', costType: '',
  });
  const [sortField, setSortField] = useState<SortField>('doc_date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ['faturas', companyId, filters, sortField, sortDir, page],
    queryFn: async () => {
      let query = supabase
        .from('invoices')
        .select('*', { count: 'exact' })
        .is('deleted_at', null)
        .order(sortField, { ascending: sortDir === 'asc' })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (companyId) {
        query = query.eq('company_id', companyId);
      }
      if (filters.search) {
        query = query.ilike('supplier_name', `%${filters.search}%`);
      }
      if (filters.year) {
        query = query.eq('doc_year', parseInt(filters.year));
      }
      if (filters.metier) {
        query = query.eq('metier', filters.metier);
      }
      if (filters.nature) {
        query = query.eq('nature_depense', filters.nature);
      }
      if (filters.costType) {
        query = query.eq('cost_type', filters.costType);
      }

      const { data: rows, count, error } = await query;
      if (error) throw error;
      return { invoices: rows as Invoice[], total: count ?? 0 };
    },
  });

  const handleSort = (field: SortField) => {
    if (field === sortField) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
    setPage(0);
  };

  const handleRowClick = (_invoice: Invoice) => {
    // TODO: Open detail drawer/modal
  };

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">{t('nav.invoices')}</h1>

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
            invoices={data?.invoices ?? []}
            sortField={sortField}
            sortDir={sortDir}
            onSort={handleSort}
            onRowClick={handleRowClick}
          />

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">
                {data!.total} factures &middot; Page {page + 1}/{totalPages}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" /> Prec.
                </button>
                <button
                  onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                  disabled={page >= totalPages - 1}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-40"
                >
                  Suiv. <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
