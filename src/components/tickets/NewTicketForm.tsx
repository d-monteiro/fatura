import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useTenant } from '@/contexts/TenantContext';
import { notifySlack } from '@/lib/slack/notify';
import { reportError } from '@/lib/errors/errorReporter';
import { Send } from 'lucide-react';
import type { TicketCategory, TicketPriority } from '@/types/tickets';

interface Preset {
  subject?: string;
  description?: string;
  category?: TicketCategory;
  priority?: TicketPriority;
}

interface Props {
  onCreated: () => void;
  onCancel: () => void;
  preset?: Preset;
}

const CATEGORIES: { value: TicketCategory; label: string }[] = [
  { value: 'general', label: 'Geral' },
  { value: 'bug', label: 'Bug' },
  { value: 'feature', label: 'Pedido de funcionalidade' },
  { value: 'billing', label: 'Faturação' },
  { value: 'integration', label: 'Integração' },
];

const PRIORITIES: { value: TicketPriority; label: string }[] = [
  { value: 'low', label: 'Baixa' },
  { value: 'medium', label: 'Média' },
  { value: 'high', label: 'Alta' },
  { value: 'urgent', label: 'Urgente' },
];

export function NewTicketForm({ onCreated, onCancel, preset }: Props) {
  const { user } = useAuth();
  const { tenant } = useTenant();
  const [subject, setSubject] = useState(preset?.subject ?? '');
  const [description, setDescription] = useState(preset?.description ?? '');
  const [category, setCategory] = useState<TicketCategory>(preset?.category ?? 'general');
  const [priority, setPriority] = useState<TicketPriority>(preset?.priority ?? 'medium');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !tenant || !subject.trim() || !description.trim()) return;

    setSubmitting(true);
    try {
      const { data: ticket, error } = await supabase.from('tickets').insert({
        tenant_id: tenant.id,
        user_id: user.id,
        subject: subject.trim(),
        description: description.trim(),
        category,
        priority,
        page_url: window.location.href,
        browser_info: { userAgent: navigator.userAgent },
      }).select('id').single();

      if (error || !ticket?.id) {
        void reportError(error ?? new Error('ticket insert returned no row'), {
          component: 'NewTicketForm/submit',
          tenantId: tenant.id,
          level: 'warn',
          extra: { category, priority, code: error?.code },
        });
        toast.error(error?.message ?? 'Não foi possível criar o pedido. Tenta de novo.');
        return;
      }

      void notifySlack({
        channel: 'tickets',
        payload: {
          tenant_name: tenant.name,
          plan_name: tenant.plan_id ? 'Plano ativo' : undefined,
          subject: subject.trim(),
          category,
          priority,
          email: user.email ?? '',
          description: description.trim(),
          ticket_id: ticket.id,
        },
      });

      onCreated();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="subject">Assunto *</Label>
        <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Descreva brevemente o problema" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Categoria</Label>
          <Select value={category} onValueChange={(v) => setCategory(v as TicketCategory)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Prioridade</Label>
          <Select value={priority} onValueChange={(v) => setPriority(v as TicketPriority)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PRIORITIES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">Descrição *</Label>
        <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descreva o problema em detalhe..." rows={5} />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" disabled={submitting || !subject.trim() || !description.trim()} className="gap-2">
          <Send className="h-4 w-4" /> Enviar
        </Button>
      </div>
    </form>
  );
}
