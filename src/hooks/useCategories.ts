import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { COST_TYPE_LABELS, METIER_LABELS, NATURE_LABELS } from '@/lib/constants';
import type { Category as DbCategory, Metier, NatureDepense, CostType } from '@/types/database';

export type Category = Pick<DbCategory, 'id' | 'axis' | 'code' | 'label' | 'sort_order'>;

export interface CategoriesByAxis {
  cost_type: Category[];
  metier: Category[];
  nature_depense: Category[];
}

const EMPTY: CategoriesByAxis = { cost_type: [], metier: [], nature_depense: [] };

export function useCategories(tenantId: string | null | undefined) {
  const { data = EMPTY, isLoading } = useQuery({
    queryKey: ['categories', tenantId],
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from('categories')
        .select('id, axis, code, label, sort_order')
        .eq('tenant_id', tenantId!)
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw error;
      const grouped: CategoriesByAxis = { cost_type: [], metier: [], nature_depense: [] };
      (rows ?? []).forEach((row) => {
        const axis = row.axis as Category['axis'];
        if (axis in grouped) grouped[axis].push(row as Category);
      });
      return grouped;
    },
  });

  const labelFor = (axis: Category['axis'], code: string | null | undefined): string => {
    if (!code) return '';
    const dynamic = data[axis].find((c) => c.code === code)?.label;
    if (dynamic) return dynamic;
    if (axis === 'metier') return METIER_LABELS[code as Metier] ?? code;
    if (axis === 'nature_depense') return NATURE_LABELS[code as NatureDepense] ?? code;
    if (axis === 'cost_type') return COST_TYPE_LABELS[code as CostType] ?? code;
    return code;
  };

  return { categories: data, loading: isLoading, labelFor };
}
