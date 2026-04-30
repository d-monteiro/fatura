import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { queryKeys } from '@/lib/queryKeys';

export interface SupplierOption {
  id: string;
  name: string;
  display_name: string | null;
  nif: string | null;
  invoice_count: number | null;
}

export interface UseTenantSuppliersResult {
  suppliers: SupplierOption[];
  noSupplierCount: number;
  isLoading: boolean;
}

interface UseTenantSuppliersOptions {
  // F3: filtros mostram só fornecedores com faturas activas (>0). UIs de
  // criação/edição mostram todos para permitir escolher um existente sem
  // faturas ainda.
  scope?: 'filter' | 'all';
}

// Todos os suppliers activos do tenant + contagem de faturas sem supplier_id.
export function useTenantSuppliers({ scope = 'all' }: UseTenantSuppliersOptions = {}): UseTenantSuppliersResult {
  const { tenant } = useTenant();
  const tenantId = tenant?.id ?? null;

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.suppliersList(tenantId),
    queryFn: async () => {
      if (!tenantId) return { suppliers: [] as SupplierOption[], noSupplierCount: 0 };

      const [suppliersRes, noSupplierRes] = await Promise.all([
        supabase
          .from('suppliers')
          .select('id, name, display_name, nif, invoice_count')
          .eq('tenant_id', tenantId)
          .is('deleted_at', null)
          .order('invoice_count', { ascending: false, nullsFirst: false })
          .order('name', { ascending: true }),
        supabase
          .from('invoices')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .is('deleted_at', null)
          .is('supplier_id', null),
      ]);

      if (suppliersRes.error) throw suppliersRes.error;

      return {
        suppliers: (suppliersRes.data ?? []) as SupplierOption[],
        noSupplierCount: noSupplierRes.count ?? 0,
      };
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!tenantId,
  });

  const filtered = useMemo(() => {
    const all = data?.suppliers ?? [];
    return scope === 'filter' ? all.filter((s) => (s.invoice_count ?? 0) > 0) : all;
  }, [data?.suppliers, scope]);

  return {
    suppliers: filtered,
    noSupplierCount: data?.noSupplierCount ?? 0,
    isLoading,
  };
}
