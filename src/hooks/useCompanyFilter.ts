import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import type { Company } from '@/types/database';

/**
 * Reads `?company=<UUID>` from the URL (set by the Sidebar).
 * Returns the active company UUID (or null when "all") and the list of companies.
 */
export function useCompanyFilter() {
  const [searchParams] = useSearchParams();
  const raw = searchParams.get('company');

  const { data: companies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data as Company[];
    },
    staleTime: 5 * 60 * 1000, // companies rarely change
  });

  // "all" or missing => no company filter
  const companyId = raw && raw !== 'all' ? raw : null;

  return { companyId, companies };
}

/**
 * Applies the company_id + deleted_at IS NULL filters to a supabase query builder.
 * Pass the result of supabase.from('invoices').select(...) as `query`.
 */
export function applyInvoiceFilters<T extends { eq: Function; is: Function }>(
  query: T,
  companyId: string | null,
): T {
  let q = query.is('deleted_at', null);
  if (companyId) {
    q = q.eq('company_id', companyId);
  }
  return q as T;
}
