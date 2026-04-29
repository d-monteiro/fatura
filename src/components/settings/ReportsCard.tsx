import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Mail, Plus, Pencil, Trash2, Send, History as HistoryIcon, Power, PowerOff, Lock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { useFeatureGate } from '@/hooks/useFeatureGate';
import { queryKeys } from '@/lib/queryKeys';
import type { ReportConfig, ReportPeriodKind } from '@/types/admin';
import { ReportConfigDialog } from './ReportConfigDialog';
import { ReportHistoryDialog } from './ReportHistoryDialog';

const FREQ_LABEL: Record<ReportPeriodKind, string> = {
  daily: 'Diário', weekly: 'Semanal', monthly: 'Mensal', quarterly: 'Trimestral',
};
const DOW = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function describeSchedule(c: ReportConfig): string {
  const hour = `${String(c.send_hour).padStart(2, '0')}:00`;
  if (c.frequency === 'daily') return `Todos os dias às ${hour}`;
  if (c.frequency === 'weekly') return `${DOW[c.send_day] ?? 'Seg'} às ${hour}`;
  if (c.frequency === 'monthly') return `Dia ${c.send_day} às ${hour}`;
  return `Trimestral · dia ${c.send_day} às ${hour}`;
}

export function ReportsCard() {
  const { tenant } = useTenant();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<ReportConfig | null | 'new'>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  // Starter limita-se a 1 config simples; Pro+ pode N (reports_custom).
  const reportsCustom = useFeatureGate('reports_custom');

  const { data: configs, isLoading } = useQuery({
    queryKey: queryKeys.reportConfigs(tenant?.id ?? null),
    enabled: !!tenant?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from('report_configs').select('*').eq('tenant_id', tenant!.id).order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ReportConfig[];
    },
  });

  const toggleActive = useMutation({
    mutationFn: async (c: ReportConfig) => {
      const { error } = await supabase.from('report_configs').update({ active: !c.active }).eq('id', c.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.reportConfigs(tenant?.id ?? null) }),
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('report_configs').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Configuração eliminada');
      qc.invalidateQueries({ queryKey: queryKeys.reportConfigs(tenant?.id ?? null) });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sendTest = useMutation({
    mutationFn: async (config: ReportConfig) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirou');
      const recipient = config.recipients[0];
      if (!recipient) throw new Error('Configuração sem destinatário');
      const { data, error } = await supabase.functions.invoke('send-report-now', {
        body: { config_id: config.id, test_recipient: recipient },
      });
      if (error) throw error;
      return data as { success: boolean; sent_to: string[] };
    },
    onSuccess: (d) => toast.success(`Email de teste enviado para ${d.sent_to.join(', ')}`),
    onError: (e: Error) => toast.error(`Falha no envio: ${e.message}`),
  });

  if (!tenant) return null;

  const configsCount = configs?.length ?? 0;
  const limitReached = !reportsCustom.allowed && configsCount >= 1;

  return (
    <div className="border border-border rounded-xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Mail size={20} />
          <h2 className="text-lg font-semibold">Relatórios automáticos</h2>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setHistoryOpen(true)} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted">
            <HistoryIcon className="h-3.5 w-3.5" /> Histórico
          </button>
          <button
            onClick={() => setEditing('new')}
            disabled={limitReached}
            title={limitReached ? 'Plano Starter limita-se a 1 relatório. Faz upgrade para Pro.' : undefined}
            className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {limitReached ? <Lock className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />} Novo
          </button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {reportsCustom.allowed
          ? 'Cria múltiplas configurações com periodicidade, conteúdos e filtros distintos. Cada uma tem o seu histórico.'
          : 'No plano Starter podes ter 1 relatório automático. Para múltiplas configs com filtros e conteúdos personalizados, faz upgrade.'}
      </p>

      {limitReached && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <Lock className="h-3.5 w-3.5 shrink-0" />
          <span>
            Limite atingido para o plano Starter.{' '}
            <Link to="/billing" className="font-semibold underline">Faz upgrade para Pro</Link> para criar mais.
          </span>
        </div>
      )}

      {isLoading && <p className="text-sm text-muted-foreground">A carregar…</p>}
      {!isLoading && configs && configs.length === 0 && (
        <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Sem configurações activas. Cria a primeira para receber relatórios.
        </div>
      )}

      <div className="space-y-2">
        {configs?.map((c) => (
          <div key={c.id} className="rounded-lg border border-border p-3 flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium">{c.name}</span>
                <span className="text-xs rounded bg-muted px-1.5 py-0.5">{FREQ_LABEL[c.frequency]}</span>
                {!c.active && <span className="text-xs rounded bg-yellow-100 text-yellow-800 px-1.5 py-0.5">Pausado</span>}
              </div>
              <div className="text-xs text-muted-foreground mt-1">{describeSchedule(c)} · {c.recipients.length} destinatário{c.recipients.length === 1 ? '' : 's'}</div>
              <div className="text-xs text-muted-foreground truncate">{c.recipients.join(', ') || '—'}</div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button title="Enviar teste" onClick={() => sendTest.mutate(c)} disabled={sendTest.isPending} className="rounded p-1.5 hover:bg-muted disabled:opacity-50"><Send className="h-3.5 w-3.5" /></button>
              <button title={c.active ? 'Pausar' : 'Activar'} onClick={() => toggleActive.mutate(c)} className="rounded p-1.5 hover:bg-muted">{c.active ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}</button>
              <button title="Editar" onClick={() => setEditing(c)} className="rounded p-1.5 hover:bg-muted"><Pencil className="h-3.5 w-3.5" /></button>
              <button title="Eliminar" onClick={() => { if (confirm(`Eliminar "${c.name}"?`)) remove.mutate(c.id); }} className="rounded p-1.5 hover:bg-muted text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          </div>
        ))}
      </div>

      {editing !== null && (
        <ReportConfigDialog open onOpenChange={(o) => !o && setEditing(null)} initial={editing === 'new' ? null : editing} tenantId={tenant.id} />
      )}
      {historyOpen && <ReportHistoryDialog open onOpenChange={setHistoryOpen} tenantId={tenant.id} />}
    </div>
  );
}
