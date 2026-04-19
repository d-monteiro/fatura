import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { TicketStatusBadge, TicketPriorityBadge } from '@/components/tickets/StatusBadge';
import type { Ticket, TicketMessage, TicketStatus, TicketPriority } from '@/types/tickets';
import { Send } from 'lucide-react';

const STATUSES: TicketStatus[] = ['open', 'in_progress', 'waiting_customer', 'resolved', 'closed'];
const PRIORITIES: TicketPriority[] = ['low', 'medium', 'high', 'urgent'];

interface Props { ticket: Ticket | null; onClose: () => void; }

export function TicketDetailDrawer({ ticket, onClose }: Props) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [reply, setReply] = useState('');

  const { data: messages = [] } = useQuery<TicketMessage[]>({
    queryKey: ['admin-ticket-messages', ticket?.id],
    enabled: !!ticket,
    queryFn: async () => {
      const { data, error } = await supabase.from('ticket_messages').select('*').eq('ticket_id', ticket!.id).order('created_at');
      if (error) throw error;
      return (data ?? []) as TicketMessage[];
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (patch: Partial<Ticket>) => {
      if (!ticket) return;
      const { error } = await supabase.from('tickets').update(patch).eq('id', ticket.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-tickets'] });
    },
    onError: () => toast.error('Erro ao atualizar ticket'),
  });

  const replyMutation = useMutation({
    mutationFn: async () => {
      if (!ticket || !user || !reply.trim()) return;
      const { error } = await supabase.from('ticket_messages').insert({
        ticket_id: ticket.id,
        user_id: user.id,
        content: reply.trim(),
        is_from_admin: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setReply('');
      qc.invalidateQueries({ queryKey: ['admin-ticket-messages', ticket?.id] });
      qc.invalidateQueries({ queryKey: ['admin-tickets'] });
    },
    onError: () => toast.error('Erro ao enviar resposta'),
  });

  if (!ticket) return null;

  return (
    <Sheet open={!!ticket} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="pr-8">{ticket.subject}</SheetTitle>
          <div className="flex items-center gap-2 pt-1">
            <TicketStatusBadge status={ticket.status} />
            <TicketPriorityBadge priority={ticket.priority} />
            <span className="text-xs text-muted-foreground">{new Date(ticket.created_at).toLocaleDateString('pt-PT')}</span>
          </div>
        </SheetHeader>

        <div className="space-y-5 mt-6">
          <div className="rounded-lg border p-3 text-sm whitespace-pre-wrap break-words bg-muted/30">
            {ticket.description}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Estado</Label>
              <Select value={ticket.status} onValueChange={(v) => updateMutation.mutate({ status: v as TicketStatus })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Prioridade</Label>
              <Select value={ticket.priority} onValueChange={(v) => updateMutation.mutate({ priority: v as TicketPriority })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          {messages.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-muted-foreground">Conversa</div>
              {messages.filter((m) => !m.is_internal).map((m) => (
                <div key={m.id} className={`rounded-lg p-3 text-sm break-words ${m.is_from_admin ? 'bg-primary/5 border-l-2 border-primary' : 'bg-muted'}`}>
                  <div className="text-xs text-muted-foreground mb-1">
                    {m.is_from_admin ? 'Admin' : 'Cliente'} · {new Date(m.created_at).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </div>
                  <div className="whitespace-pre-wrap">{m.content}</div>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-xs">Responder como admin</Label>
            <div className="flex gap-2">
              <Textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={3} className="flex-1" placeholder="Mensagem para o cliente..." />
              <Button
                size="icon"
                disabled={!reply.trim() || replyMutation.isPending}
                onClick={() => replyMutation.mutate()}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
