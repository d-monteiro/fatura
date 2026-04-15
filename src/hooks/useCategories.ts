import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';

export interface Category {
  id: string;
  axis: 'cost_type' | 'metier' | 'nature_depense';
  code: string;
  label: string;
  sort_order: number;
}

export interface CategoriesByAxis {
  cost_type: Category[];
  metier: Category[];
  nature_depense: Category[];
}

const EMPTY: CategoriesByAxis = { cost_type: [], metier: [], nature_depense: [] };

export function useCategories(tenantId: string | null | undefined) {
  const [categories, setCategories] = useState<CategoriesByAxis>(EMPTY);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!tenantId) { setCategories(EMPTY); return; }
    let cancelled = false;
    setLoading(true);
    supabase.from('categories')
      .select('id, axis, code, label, sort_order')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => {
        if (cancelled) return;
        const grouped: CategoriesByAxis = { cost_type: [], metier: [], nature_depense: [] };
        (data ?? []).forEach((row) => {
          const axis = row.axis as Category['axis'];
          if (axis in grouped) grouped[axis].push(row as Category);
        });
        setCategories(grouped);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [tenantId]);

  const labelFor = (axis: Category['axis'], code: string | null | undefined): string => {
    if (!code) return '';
    return categories[axis].find((c) => c.code === code)?.label ?? code;
  };

  return { categories, loading, labelFor };
}
