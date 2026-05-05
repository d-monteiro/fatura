import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { queryKeys } from '@/lib/queryKeys';
import type { SyncJob } from '@/types/sync';

const ACTIVE_STATUSES = ['queued', 'discovering', 'processing', 'paused_reauth'] as const;

// Único ponto de leitura do sync_job activo de um tenant. Substitui o
// useSyncStatus antigo (que apontava para sync_runs, hoje desactivado).
//
// onTerminate dispara quando um job antes activo passa para terminal —
// usado pelo banner global para mostrar toast "concluída". Recebe o job
// recém-terminal já com counts_by_status finais.
export function useActiveSyncJob(
  tenantId: string | null,
  options: { onTerminate?: (job: SyncJob) => void } = {},
): {
  activeJob: SyncJob | null;
  loading: boolean;
} {
  const qc = useQueryClient();
  const prevIdRef = useRef<string | null>(null);
  const onTerminateRef = useRef(options.onTerminate);
  onTerminateRef.current = options.onTerminate;

  const { data, isLoading } = useQuery<SyncJob | null>({
    queryKey: queryKeys.syncJobActive(tenantId),
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase
        .from('sync_jobs')
        .select('*')
        .eq('tenant_id', tenantId!)
        .in('status', ACTIVE_STATUSES as unknown as string[])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data as SyncJob | null) ?? null;
    },
    refetchInterval: 10_000,
  });

  // Detecta transição para terminal: o job desaparece do filtro activo, mas
  // queremos mostrar uma notificação ao user com o resultado final. Vai ler
  // o job pelo id (já com status final + counts) e propaga.
  useEffect(() => {
    const prevId = prevIdRef.current;
    const currentId = data?.id ?? null;

    if (prevId && !currentId && onTerminateRef.current) {
      const cb = onTerminateRef.current;
      void supabase
        .from('sync_jobs')
        .select('*')
        .eq('id', prevId)
        .maybeSingle()
        .then(({ data: terminal }) => {
          if (terminal) cb(terminal as SyncJob);
        });
      // Faturas podem ter aparecido durante o sync — invalida listas para
      // que o user veja as novas inbox sem refresh manual.
      void qc.invalidateQueries({ queryKey: ['faturas'] });
      void qc.invalidateQueries({ queryKey: ['recent-invoices'] });
      void qc.invalidateQueries({ queryKey: ['dashboard-metrics'] });
    }

    prevIdRef.current = currentId;
  }, [data, qc]);

  return {
    activeJob: data ?? null,
    loading: isLoading,
  };
}
