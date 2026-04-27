import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { FALLBACK_CATEGORY_LABELS } from '@/lib/constants';
import type { Category as DbCategory } from '@/types/database';

export type Category = Pick<DbCategory, 'id' | 'code' | 'label' | 'sort_order' | 'is_fixed'>;

const EMPTY: Category[] = [];

export function useCategories(tenantId: string | null | undefined) {
  const { data = EMPTY, isLoading } = useQuery({
    queryKey: ['categories', tenantId],
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from('categories')
        .select('id, code, label, sort_order, is_fixed')
        .eq('tenant_id', tenantId!)
        .eq('axis', 'category')
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw error;
      return (rows ?? []) as Category[];
    },
  });

  const labelFor = (code: string | null | undefined): string => {
    if (!code) return '';
    const dynamic = data.find((c) => c.code === code)?.label;
    if (dynamic) return dynamic;
    return FALLBACK_CATEGORY_LABELS[code] ?? code;
  };

  const isFixed = (code: string | null | undefined): boolean => {
    if (!code) return false;
    return data.find((c) => c.code === code)?.is_fixed ?? false;
  };

  return { categories: data, loading: isLoading, labelFor, isFixed };
}
