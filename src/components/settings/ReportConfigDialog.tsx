import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/lib/supabase/client';
import { queryKeys } from '@/lib/queryKeys';
import type { ReportConfig, ReportContentOptions, ReportPeriodKind } from '@/types/admin';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: ReportConfig | null;
  tenantId: string;
}

const DEFAULT_CONTENT: ReportContentOptions = { totals: true, top_suppliers: true, categories: true, alerts: true, top_expenses: false };

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const DOW = [{ v: 1, l: 'Segunda' }, { v: 2, l: 'Terça' }, { v: 3, l: 'Quarta' }, { v: 4, l: 'Quinta' }, { v: 5, l: 'Sexta' }, { v: 6, l: 'Sábado' }, { v: 0, l: 'Domingo' }];
const DOM = Array.from({ length: 28 }, (_, i) => i + 1);

export function ReportConfigDialog({ open, onOpenChange, initial, tenantId }: Props) {
  const qc = useQueryClient();
  const isNew = !initial;
  const [name, setName] = useState(initial?.name ?? 'Relatório principal');
  const [frequency, setFrequency] = useState<ReportPeriodKind>(initial?.frequency ?? 'weekly');
  const [sendDay, setSendDay] = useState<number>(initial?.send_day ?? 1);
  const [sendHour, setSendHour] = useState<number>(initial?.send_hour ?? 8);
  const [recipientsRaw, setRecipientsRaw] = useState<string>(initial?.recipients.join(', ') ?? '');
  const [content, setContent] = useState<ReportContentOptions>(initial?.content_options ?? DEFAULT_CONTENT);
  const [companyIds, setCompanyIds] = useState<string[]>(initial?.filters.companyIds ?? []);
  const [categoryIds, setCategoryIds] = useState<string[]>(initial?.filters.categories ?? []);

  const { data: companies } = useQuery({
    queryKey: queryKeys.companies, queryFn: async () => {
      const { data } = await supabase.from('companies').select('id, name').eq('tenant_id', tenantId).order('name');
      return (data ?? []) as { id: string; name: string }[];
    },
  });
  const { data: categories } = useQuery({
    queryKey: queryKeys.categoriesByTenant(tenantId), queryFn: async () => {
      const { data } = await supabase.from('categories').select('code, label').eq('tenant_id', tenantId).eq('axis', 'category').eq('is_active', true).order('sort_order');
      return (data ?? []) as { code: string; label: string }[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const recipients = recipientsRaw.split(',').map((s) => s.trim()).filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));
      if (recipients.length === 0) throw new Error('Adicione pelo menos um email válido.');
      if (!name.trim()) throw new Error('Nome obrigatório.');
      const payload = {
        tenant_id: tenantId, name: name.trim(), frequency, send_day: sendDay, send_hour: sendHour,
        recipients, content_options: content,
        filters: { companyIds: companyIds.length ? companyIds : null, categories: categoryIds.length ? categoryIds : null },
      };
      if (isNew) {
        const { error } = await supabase.from('report_configs').insert(payload);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('report_configs').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', initial!.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(isNew ? 'Configuração criada' : 'Configuração actualizada');
      qc.invalidateQueries({ queryKey: queryKeys.reportConfigs(tenantId) });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = (key: keyof ReportContentOptions) => setContent((p) => ({ ...p, [key]: !p[key] }));
  const toggleArr = (arr: string[], setArr: (a: string[]) => void, id: string) => setArr(arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{isNew ? 'Novo relatório' : 'Editar relatório'}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5"><Label>Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Resumo da gestão" /></div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Frequência</Label>
              <Select value={frequency} onValueChange={(v) => setFrequency(v as ReportPeriodKind)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Diário</SelectItem><SelectItem value="weekly">Semanal</SelectItem>
                  <SelectItem value="monthly">Mensal</SelectItem><SelectItem value="quarterly">Trimestral</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Hora (local do tenant)</Label>
              <Select value={String(sendHour)} onValueChange={(v) => setSendHour(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{HOURS.map((h) => <SelectItem key={h} value={String(h)}>{String(h).padStart(2, '0')}:00</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          {frequency === 'weekly' && (
            <div className="space-y-1.5"><Label>Dia da semana</Label>
              <Select value={String(sendDay)} onValueChange={(v) => setSendDay(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{DOW.map((d) => <SelectItem key={d.v} value={String(d.v)}>{d.l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          {(frequency === 'monthly' || frequency === 'quarterly') && (
            <div className="space-y-1.5"><Label>Dia do mês</Label>
              <Select value={String(sendDay)} onValueChange={(v) => setSendDay(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{DOM.map((d) => <SelectItem key={d} value={String(d)}>{d}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5"><Label>Destinatários (separados por vírgula)</Label>
            <Input value={recipientsRaw} onChange={(e) => setRecipientsRaw(e.target.value)} placeholder="contabilidade@empresa.pt, gestor@empresa.pt" />
          </div>

          <div className="space-y-1.5"><Label>Conteúdo do email</Label>
            <div className="grid grid-cols-2 gap-1 text-sm">
              {(Object.keys(DEFAULT_CONTENT) as (keyof ReportContentOptions)[]).map((k) => (
                <label key={k} className="flex items-center gap-2 rounded border border-border px-2 py-1.5 cursor-pointer hover:bg-muted">
                  <input type="checkbox" checked={content[k]} onChange={() => toggle(k)} />
                  <span>{({ totals: 'Totais', top_suppliers: 'Fornecedores top', categories: 'Por categoria', alerts: 'Alertas pendentes', top_expenses: 'Top 10 despesas' } as Record<string, string>)[k]}</span>
                </label>
              ))}
            </div>
          </div>

          {!!companies?.length && (
            <div className="space-y-1.5"><Label>Empresas (vazio = todas)</Label>
              <div className="flex flex-wrap gap-1">{companies.map((c) => (
                <button type="button" key={c.id} onClick={() => toggleArr(companyIds, setCompanyIds, c.id)} className={`text-xs rounded-full border px-2 py-0.5 ${companyIds.includes(c.id) ? 'bg-primary text-white border-primary' : 'border-border hover:bg-muted'}`}>{c.name}</button>
              ))}</div>
            </div>
          )}
          {!!categories?.length && (
            <div className="space-y-1.5"><Label>Categorias (vazio = todas)</Label>
              <div className="flex flex-wrap gap-1">{categories.map((c) => (
                <button type="button" key={c.code} onClick={() => toggleArr(categoryIds, setCategoryIds, c.code)} className={`text-xs rounded-full border px-2 py-0.5 ${categoryIds.includes(c.code) ? 'bg-primary text-white border-primary' : 'border-border hover:bg-muted'}`}>{c.label}</button>
              ))}</div>
            </div>
          )}
        </div>
        <DialogFooter>
          <button onClick={() => onOpenChange(false)} className="rounded-lg border border-border px-3 py-1.5 text-sm">Cancelar</button>
          <button onClick={() => save.mutate()} disabled={save.isPending} className="rounded-lg bg-primary px-3 py-1.5 text-sm text-white disabled:opacity-50">{save.isPending ? 'A guardar…' : 'Guardar'}</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
