import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { queryKeys } from '@/lib/queryKeys';
import { Badge } from '@/components/ui/badge';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { SyncJobDetailDrawer } from '@/components/admin/SyncJobDetailDrawer';
import { SyncJobStatusBadge, SyncJobTriggerBadge } from '@/components/admin/SyncJobBadges';
import type { AdminSyncJobOverview } from '@/types/sync';

const FILTERS: Array<{ value: 'active' | 'errors' | 'recent' | 'all'; label: string }> = [
  { value: 'active', label: 'Activos' },
  { value: 'errors', label: 'Com erro' },
  { value: 'recent', label: 'Últimos 7 dias' },
  { value: 'all', label: 'Todos' },
];

export default function AdminSyncJobs() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['value']>('active');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: jobs = [], isLoading } = useQuery<AdminSyncJobOverview[]>({
    queryKey: queryKeys.adminSyncJobs(filter),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_get_sync_jobs', {
        p_filter: filter,
        p_limit: 200,
        p_offset: 0,
      });
      if (error) throw error;
      return (data ?? []) as AdminSyncJobOverview[];
    },
    // Filtro 'active' precisa cadência rápida (admin a observar live).
    // Os restantes filtros não estagnam — novos erros podem aparecer a
    // qualquer momento — mas 10s é suficiente sem rebentar a BD com 200 rows.
    refetchInterval: filter === 'active' ? 5_000 : 10_000,
  });

  const activeCount = jobs.filter((j) =>
    ['queued', 'discovering', 'processing', 'paused_reauth'].includes(j.status),
  ).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Sync Jobs</h1>
          <p className="text-sm text-muted-foreground">
            {activeCount} activo(s) · {jobs.length} {filter === 'all' ? 'total' : 'no filtro'}
          </p>
        </div>
        <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            {FILTERS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">A carregar...</div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Sem sync jobs neste filtro.</div>
      ) : (
        <div className="rounded-lg border divide-y">
          {jobs.map((j) => {
            const completed = j.counts_by_status?.completed ?? 0;
            const total = Object.values(j.counts_by_status ?? {})
              .reduce<number>((a, n) => a + (n ?? 0), 0);
            return (
              <button
                key={j.id}
                onClick={() => setSelectedId(j.id)}
                className="w-full p-4 text-left hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center justify-between gap-3 mb-1">
                  <span className="font-medium text-sm truncate">{j.tenant_name ?? '(sem nome)'}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <SyncJobTriggerBadge trigger={j.trigger} />
                    <SyncJobStatusBadge status={j.status} />
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span className="truncate">
                    {j.email_address ?? '—'} · {new Date(j.created_at).toLocaleString('pt-PT')}
                  </span>
                  <span className="shrink-0">
                    {completed}/{total} concluídas · {j.total_messages_seen} emails
                    {j.error_message && (
                      <Badge variant="destructive" className="ml-2">erro</Badge>
                    )}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <SyncJobDetailDrawer jobId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}
