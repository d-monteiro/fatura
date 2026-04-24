import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { invalidateInvoiceLists } from '@/lib/queryKeys';

// Subscreve postgres_changes em `invoices` filtrado pelo tenant actual.
// Qualquer INSERT/UPDATE/DELETE dispara invalidate das listas — o UI
// refresh-se sozinho quando chegam invoices do email ou quando uma é
// soft-deleted. Sem isto o user tinha de fazer F5.
export function useInvoicesRealtime(tenantId: string | null): void {
  const qc = useQueryClient();

  useEffect(() => {
    if (!tenantId) return;
    const channel = supabase
      .channel(`invoices:${tenantId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'invoices', filter: `tenant_id=eq.${tenantId}` },
        () => {
          invalidateInvoiceLists(qc);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [tenantId, qc]);
}
