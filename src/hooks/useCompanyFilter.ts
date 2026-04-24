import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import type { Company } from '@/types/database';
import { queryKeys } from '@/lib/queryKeys';

// Lê `?company=<UUID>` (posto pelo Sidebar); null = "todas".
export function useCompanyFilter() {
  const [searchParams] = useSearchParams();
  const raw = searchParams.get('company');

  const { data: companies = [] } = useQuery({
    queryKey: queryKeys.companies,
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

