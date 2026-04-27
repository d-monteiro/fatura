import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Copy, ChevronRight } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { useCompanyFilter } from '@/hooks/useCompanyFilter';
import { queryKeys } from '@/lib/queryKeys';
import type { PotentialDuplicateRow } from '@/types/database';

export function DuplicatesWidget() {
  const { tenant } = useTenant();
  const { companyId } = useCompanyFilter();
  const navigate = useNavigate();

  const { data: pairs = [] } = useQuery({
    queryKey: queryKeys.duplicates(tenant?.id ?? null, companyId),
    enabled: !!tenant?.id,
    queryFn: async (): Promise<PotentialDuplicateRow[]> => {
      const { data, error } = await supabase.rpc('find_potential_duplicates', {
        p_tenant_id: tenant!.id,
        p_company_id: companyId,
      });
      if (error) throw error;
      return (data ?? []) as PotentialDuplicateRow[];
    },
  });

  if (pairs.length === 0) return null;

  return (
    <button
      type="button"
      onClick={() => navigate('/invoices/duplicates')}
      className="flex w-full items-center justify-between rounded-2xl border border-amber-200 bg-amber-50 p-4 text-left shadow-card transition hover:bg-amber-100 sm:p-5"
    >
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-amber-500 p-2.5">
          <Copy className="h-5 w-5 text-white" />
        </div>
        <div>
          <p className="text-sm font-semibold text-amber-900 sm:text-base">
            {pairs.length === 1
              ? '1 possível duplicado detectado'
              : `${pairs.length} possíveis duplicados detectados`}
          </p>
          <p className="mt-0.5 text-xs text-amber-700 sm:text-sm">
            Revê os pares antes de exportar para o contabilista.
          </p>
        </div>
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-amber-700" />
    </button>
  );
}
