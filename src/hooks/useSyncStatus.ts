import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { queryKeys } from '@/lib/queryKeys';
import type { SyncRun } from '@/types/database';

// Último sync_run do tenant (qualquer status). Usado pelo banner de
// progresso e pelo toast de conclusão. Combina fetch inicial com
// subscrição Realtime — qualquer INSERT/UPDATE em sync_runs invalida
// a query para o hook refletir o estado actual.
export function useSyncStatus(tenantId: string | null): {
  latest: SyncRun | null;
  running: boolean;
  loading: boolean;
} {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.syncRunsLatest(tenantId),
    queryFn: async () => {
      if (!tenantId) return null;
      const { data } = await supabase.from('sync_runs')
        .select('*').eq('tenant_id', tenantId)
        .order('started_at', { ascending: false }).limit(1).maybeSingle();
      return (data as SyncRun | null) ?? null;
    },
    enabled: !!tenantId,
    staleTime: 10_000,
  });

  useEffect(() => {
    if (!tenantId) return;
    const channel = supabase
      .channel(`sync_runs:${tenantId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sync_runs', filter: `tenant_id=eq.${tenantId}` },
        () => {
          void qc.invalidateQueries({ queryKey: queryKeys.syncRunsLatest(tenantId) });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [tenantId, qc]);

  return {
    latest: data ?? null,
    running: data?.status === 'running',
    loading: isLoading,
  };
}
