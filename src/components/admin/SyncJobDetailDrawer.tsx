import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, Ban, RotateCcw } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase/client';
import { queryKeys } from '@/lib/queryKeys';
import { SyncJobStatusBadge, SyncJobTriggerBadge } from '@/components/admin/SyncJobBadges';
import type { AdminSyncJobDetail, SyncJobCounts } from '@/types/sync';
import { isSyncJobTerminal, INVOICE_PIPELINE_STATUSES, INVOICE_TERMINAL_STATUSES } from '@/types/sync';

interface Props { jobId: string | null; onClose: () => void; }

const INVOICE_STATUS_LABEL: Record<string, string> = {
  discovered: 'Descobertos',
  fetching: 'A baixar',
  analyzing: 'A analisar',
  extracted: 'A guardar',
  completed: 'Concluídos',
  rejected: 'Não-faturas',
  duplicate: 'Duplicadas',
  failed_permanent: 'Falhas permanentes',
  cancelled: 'Cancelados',
  review: 'Em revisão',
};

function fmtCounts(counts: SyncJobCounts | null | undefined): Array<[string, number]> {
  if (!counts) return [];
  const order = [...INVOICE_PIPELINE_STATUSES, ...INVOICE_TERMINAL_STATUSES];
  return order
    .filter((k) => (counts[k] ?? 0) > 0)
    .map((k) => [k, counts[k] as number]);
}

export function SyncJobDetailDrawer({ jobId, onClose }: Props) {
  const qc = useQueryClient();
  const [confirmingReset, setConfirmingReset] = useState(false);

  const { data: detail, isLoading } = useQuery<AdminSyncJobDetail | null>({
    queryKey: queryKeys.adminSyncJobDetail(jobId),
    enabled: !!jobId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_get_sync_job_detail', { p_job_id: jobId! });
      if (error) throw error;
      const rows = (data ?? []) as AdminSyncJobDetail[];
      return rows[0] ?? null;
    },
    refetchInterval: 5_000,
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('admin_cancel_sync_job', { p_job_id: jobId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Sync job cancelado');
      qc.invalidateQueries({ queryKey: ['admin', 'sync-jobs'] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Erro ao cancelar'),
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('admin_reset_sync_job_failed_invoices', { p_job_id: jobId });
      if (error) throw error;
      return data as number;
    },
    onSuccess: (count) => {
      toast.success(`${count} item(s) re-tentado(s)`);
      setConfirmingReset(false);
      qc.invalidateQueries({ queryKey: ['admin', 'sync-jobs'] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Erro ao re-tentar'),
  });

  const breakdown = useMemo(() => fmtCounts(detail?.invoices_breakdown), [detail?.invoices_breakdown]);
  const failedCount = detail?.invoices_breakdown?.failed_permanent ?? 0;
  const open = !!jobId;

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle>Sync job</SheetTitle>
        </SheetHeader>

        {isLoading || !detail ? (
          <div className="text-sm text-muted-foreground">A carregar...</div>
        ) : (
          <div className="space-y-5 text-sm">
            <div className="flex items-center gap-2 flex-wrap">
              <SyncJobStatusBadge status={detail.status} />
              <SyncJobTriggerBadge trigger={detail.trigger} />
              {detail.completed_at && (
                <Badge variant="outline">
                  Terminado {new Date(detail.completed_at).toLocaleString('pt-PT')}
                </Badge>
              )}
            </div>

            <div className="rounded-md border bg-muted/30 p-3 space-y-1">
              <div className="font-medium">{detail.tenant_name ?? '(sem nome)'}</div>
              <div className="text-xs text-muted-foreground">
                {detail.email_address ?? '—'}{detail.user_email ? ` · ${detail.user_email}` : ''}
              </div>
              <div className="text-xs text-muted-foreground">
                Iniciado: {new Date(detail.started_at).toLocaleString('pt-PT')}
              </div>
              <div className="text-xs text-muted-foreground">
                Heartbeat: {new Date(detail.last_heartbeat_at).toLocaleString('pt-PT')}
              </div>
            </div>

            {detail.error_message && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs flex gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <div className="break-words">{detail.error_message}</div>
              </div>
            )}

            <div>
              <div className="font-medium mb-2">Invoices ({detail.total_invoices_created} criadas)</div>
              {breakdown.length === 0 ? (
                <div className="text-xs text-muted-foreground">Sem invoices ainda.</div>
              ) : (
                <div className="rounded-md border divide-y">
                  {breakdown.map(([status, n]) => (
                    <div key={status} className="flex items-center justify-between px-3 py-2 text-sm">
                      <span>{INVOICE_STATUS_LABEL[status] ?? status}</span>
                      <span className="font-mono tabular-nums">{n}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-md border p-3 space-y-1 text-xs">
              <div><span className="text-muted-foreground">Mensagens vistas:</span> {detail.total_messages_seen}</div>
              {detail.date_from && (
                <div>
                  <span className="text-muted-foreground">Janela:</span>{' '}
                  {new Date(detail.date_from).toLocaleDateString('pt-PT')} –{' '}
                  {detail.date_to ? new Date(detail.date_to).toLocaleDateString('pt-PT') : '—'}
                </div>
              )}
              <div className="break-all">
                <span className="text-muted-foreground">Query:</span> <code>{detail.gmail_query}</code>
              </div>
              {detail.gmail_page_token && (
                <div className="break-all">
                  <span className="text-muted-foreground">Page token:</span> <code>{detail.gmail_page_token.slice(0, 60)}…</code>
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2 pt-2 border-t">
              {!isSyncJobTerminal(detail.status) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => cancelMutation.mutate()}
                  disabled={cancelMutation.isPending}
                  className="gap-1"
                >
                  <Ban className="h-4 w-4" />
                  {cancelMutation.isPending ? 'A cancelar...' : 'Cancelar job'}
                </Button>
              )}

              {failedCount > 0 && (
                confirmingReset ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      Re-tentar {failedCount} item(s)?
                    </span>
                    <Button
                      size="sm"
                      onClick={() => resetMutation.mutate()}
                      disabled={resetMutation.isPending}
                    >
                      {resetMutation.isPending ? 'A enviar...' : 'Confirmar'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmingReset(false)}>
                      Cancelar
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmingReset(true)}
                    className="gap-1"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Re-tentar {failedCount} falhas
                  </Button>
                )
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
