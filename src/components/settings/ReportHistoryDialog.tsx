import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, AlertTriangle, RotateCcw } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase/client';
import { queryKeys } from '@/lib/queryKeys';
import type { ReportDelivery, ReportPeriodKind } from '@/types/admin';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tenantId: string;
}

const FREQ: Record<ReportPeriodKind, string> = {
  daily: 'Diário', weekly: 'Semanal', monthly: 'Mensal', quarterly: 'Trimestral',
};

function fmtPeriod(kind: ReportPeriodKind, start: string, end: string): string {
  const s = start.split('-').reverse().join('/');
  const e = end.split('-').reverse().join('/');
  return `${FREQ[kind]} · ${s} a ${e}`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' });
}

export function ReportHistoryDialog({ open, onOpenChange, tenantId }: Props) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.reportDeliveries(tenantId),
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.from('report_deliveries')
        .select('id, config_id, period_kind, period_start, period_end, status, error, sent_at, email_to, invoices_count')
        .eq('tenant_id', tenantId).order('sent_at', { ascending: false }).limit(50);
      if (error) throw error;
      return (data ?? []) as ReportDelivery[];
    },
  });

  const resend = useMutation({
    mutationFn: async (deliveryId: string) => {
      const { data, error } = await supabase.functions.invoke('send-report-now', { body: { delivery_id: deliveryId } });
      if (error) throw error;
      return data as { success: boolean; sent_to: string[] };
    },
    onSuccess: (d) => {
      toast.success(`Re-enviado para ${d.sent_to.join(', ')}`);
      qc.invalidateQueries({ queryKey: queryKeys.reportDeliveries(tenantId) });
    },
    onError: (e: Error) => toast.error(`Falha: ${e.message}`),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Histórico de envios</DialogTitle></DialogHeader>
        {isLoading && <p className="text-sm text-muted-foreground">A carregar…</p>}
        {!isLoading && (data?.length ?? 0) === 0 && (
          <p className="text-sm text-muted-foreground">Sem envios registados ainda.</p>
        )}
        <div className="space-y-2">
          {data?.map((d) => (
            <div key={d.id} className="rounded-lg border border-border p-3 flex items-start justify-between gap-3 text-sm">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {d.status === 'sent'
                    ? <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                    : <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />}
                  <span className="font-medium">{fmtPeriod(d.period_kind, d.period_start, d.period_end)}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">{fmtDate(d.sent_at)} · {d.invoices_count} faturas</div>
                <div className="text-xs text-muted-foreground truncate">Para: {d.email_to}</div>
                {d.status === 'failed' && d.error && (
                  <div className="text-xs text-destructive mt-1 break-words">{d.error}</div>
                )}
              </div>
              <button
                title={d.config_id ? 'Re-enviar' : 'Re-envio não suportado para envios legacy'}
                disabled={!d.config_id || resend.isPending}
                onClick={() => resend.mutate(d.id)}
                className="rounded p-1.5 hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
