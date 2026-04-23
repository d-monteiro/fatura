import { useState, useMemo } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Mail, Check, Clock, AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { supabase } from '@/lib/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import type { AutoReports } from '@/types/tenant';
import type { ReportDelivery } from '@/types/admin';

type LastDelivery = Omit<ReportDelivery, 'id' | 'invoices_count'>;

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' });
}

function fmtPeriod(kind: string, start: string, end: string): string {
  const s = start.split('-').reverse().join('/');
  const e = end.split('-').reverse().join('/');
  return `${kind === 'weekly' ? 'Semanal' : 'Mensal'} · ${s} a ${e}`;
}

export function ReportsCard() {
  const { tenant, refreshTenant } = useTenant();

  const initial = useMemo(() => ({
    autoReports: tenant?.auto_reports ?? 'never' as AutoReports,
    reportEmail: tenant?.report_email ?? '',
  }), [tenant]);

  const [autoReports, setAutoReports] = useState<AutoReports>(initial.autoReports);
  const [reportEmail, setReportEmail] = useState<string>(initial.reportEmail);

  const dirty = autoReports !== initial.autoReports || reportEmail.trim() !== (initial.reportEmail ?? '');

  const { data: last } = useQuery<LastDelivery | null>({
    queryKey: ['report-deliveries', tenant?.id],
    enabled: !!tenant?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('report_deliveries')
        .select('period_kind, period_start, period_end, status, error, sent_at, email_to')
        .eq('tenant_id', tenant!.id)
        .order('sent_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as LastDelivery | null;
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!tenant?.id) throw new Error('Sem tenant activo');
      const trimmed = reportEmail.trim();
      if (autoReports !== 'never' && trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
        throw new Error('Email inválido');
      }
      const { error } = await supabase.from('tenants').update({
        auto_reports: autoReports,
        report_email: trimmed || null,
        updated_at: new Date().toISOString(),
      }).eq('id', tenant.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await refreshTenant();
      toast.success('Preferências de relatório guardadas');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!tenant) return null;

  return (
    <div className="border border-border rounded-xl p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Mail size={20} />
        <h2 className="text-lg font-semibold">Relatórios automáticos</h2>
      </div>

      <p className="text-xs text-muted-foreground">
        Resumo das faturas do período enviado por email. Weekly envia à segunda de manhã; mensal no dia 1.
      </p>

      <div className="space-y-1.5">
        <Label>Frequência</Label>
        <Select value={autoReports} onValueChange={(v) => setAutoReports(v as AutoReports)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="never">Nunca</SelectItem>
            <SelectItem value="weekly">Semanal · segunda de manhã</SelectItem>
            <SelectItem value="monthly">Mensal · dia 1 de cada mês</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {autoReports !== 'never' && (
        <div className="space-y-1.5">
          <Label htmlFor="rc-email">Email destinatário</Label>
          <Input
            id="rc-email"
            type="email"
            value={reportEmail}
            onChange={(e) => setReportEmail(e.target.value)}
            placeholder="Deixe vazio para usar o email da conta"
          />
          <p className="text-xs text-muted-foreground">
            Se deixar vazio, o relatório vai para o email com que o dono da conta se registou.
          </p>
        </div>
      )}

      {last && (
        <div className="rounded-md border border-border bg-gray-50 p-3 text-xs space-y-1">
          <div className="flex items-center gap-2 font-medium">
            {last.status === 'sent'
              ? <Clock className="h-3.5 w-3.5 text-green-600" />
              : <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
            Último envio
          </div>
          <div className="text-muted-foreground">
            {fmtPeriod(last.period_kind, last.period_start, last.period_end)} · {fmtDate(last.sent_at)}
          </div>
          <div className="text-muted-foreground">Para: {last.email_to}</div>
          {last.status === 'failed' && last.error && (
            <div className="text-destructive break-words">Erro: {last.error}</div>
          )}
        </div>
      )}

      <div className="flex justify-end pt-2">
        <button
          onClick={() => save.mutate()}
          disabled={!dirty || save.isPending}
          className="inline-flex items-center gap-1 rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          <Check className="h-3.5 w-3.5" /> {save.isPending ? 'A guardar...' : 'Guardar'}
        </button>
      </div>
    </div>
  );
}
