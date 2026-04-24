import { useEffect, useRef } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useSyncStatus } from '@/hooks/useSyncStatus';
import type { SyncRun } from '@/types/database';

// Banner fica visível enquanto `sync_runs.status === 'running'`.
// Ao transitar para done/error, dispara toast com breakdown ou erro.
export function SyncBanner({ tenantId }: { tenantId: string | null }) {
  const { latest, running } = useSyncStatus(tenantId);
  const prevStatusRef = useRef<SyncRun['status'] | null>(null);

  useEffect(() => {
    const prev = prevStatusRef.current;
    const next = latest?.status ?? null;

    if (prev === 'running' && next === 'done' && latest) {
      toast.success(formatDoneMessage(latest), { duration: 6000 });
    } else if (prev === 'running' && next === 'error' && latest) {
      toast.error(`Sincronização falhou: ${latest.error_message ?? 'erro desconhecido'}`, { duration: 10000 });
    }

    prevStatusRef.current = next;
  }, [latest]);

  if (!running) return null;

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
      <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin text-blue-600" />
      <span className="flex-1">
        A sincronizar emails… isto pode demorar alguns segundos. As faturas novas aparecem sozinhas.
      </span>
      {latest && latest.total_errors > 0 && (
        <span className="inline-flex items-center gap-1 text-amber-700">
          <AlertCircle className="h-3.5 w-3.5" />
          {latest.total_errors} {latest.total_errors === 1 ? 'erro' : 'erros'}
        </span>
      )}
    </div>
  );
}

function formatDoneMessage(r: SyncRun): string {
  const parts: string[] = [];
  if (r.total_discovered > 0) {
    parts.push(`${r.total_discovered} ${r.total_discovered === 1 ? 'nova' : 'novas'}`);
  }
  const ignoredTotal = r.total_duplicates + r.total_rejected;
  if (ignoredTotal > 0) {
    parts.push(`${ignoredTotal} ${ignoredTotal === 1 ? 'ignorada' : 'ignoradas'}`);
  }
  if (r.total_errors > 0) {
    parts.push(`${r.total_errors} ${r.total_errors === 1 ? 'erro' : 'erros'}`);
  }
  if (parts.length === 0) return 'Sincronização concluída. Não havia nada novo.';
  return `Sincronização concluída: ${parts.join(', ')}.`;
}
