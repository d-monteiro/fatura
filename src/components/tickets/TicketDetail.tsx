import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { TicketStatusBadge, TicketPriorityBadge } from './StatusBadge';
import { ArrowLeft, Send, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import type { Ticket, TicketMessage, TicketStatus } from '@/types/tickets';

interface Props {
  ticket: Ticket;
  onBack: () => void;
  onChanged?: () => void;
}

export function TicketDetail({ ticket, onBack, onChanged }: Props) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<TicketStatus>(ticket.status);
  const [closing, setClosing] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  useEffect(() => {
    supabase
      .from('ticket_messages')
      .select('*')
      .eq('ticket_id', ticket.id)
      .order('created_at')
      .then(({ data }) => { if (data) setMessages(data as TicketMessage[]); });
  }, [ticket.id]);

  const handleSend = async () => {
    if (!user || !newMessage.trim()) return;
    setSending(true);
    try {
      const { data, error } = await supabase.from('ticket_messages').insert({
        ticket_id: ticket.id,
        user_id: user.id,
        content: newMessage.trim(),
      }).select().single();
      if (error) {
        toast.error('Não foi possível enviar a mensagem. Tenta novamente.');
        return;
      }
      if (data) setMessages((prev) => [...prev, data as TicketMessage]);
      setNewMessage('');
    } finally {
      setSending(false);
    }
  };

  const handleClose = async () => {
    setClosing(true);
    try {
      const { error } = await supabase
        .from('tickets')
        .update({ status: 'closed', resolved_at: new Date().toISOString() })
        .eq('id', ticket.id);
      if (error) {
        toast.error('Não foi possível fechar o ticket.');
        return;
      }
      setStatus('closed');
      setConfirmClose(false);
      onChanged?.();
    } finally {
      setClosing(false);
    }
  };

  const isClosed = status === 'closed';
  const isOwner = user?.id === ticket.user_id;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="font-semibold text-lg flex-1 min-w-0 truncate">{ticket.subject}</h2>
        <div className="flex items-center gap-2 shrink-0">
          <TicketStatusBadge status={status} />
          <TicketPriorityBadge priority={ticket.priority} />
        </div>
      </div>

      <div className="rounded-lg border p-4 text-sm whitespace-pre-wrap break-words">
        {ticket.description}
      </div>
      <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-2">
        <span>
          Criado a {new Date(ticket.created_at).toLocaleDateString('pt-PT', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </span>
        <span aria-hidden>·</span>
        <span>Submetido — conteúdo não editável</span>
      </div>

      {messages.length > 0 && (
        <div className="space-y-3">
          {messages.filter((m) => !m.is_internal).map((msg) => (
            <div
              key={msg.id}
              className={`rounded-lg p-3 text-sm break-words ${
                msg.is_from_admin ? 'bg-primary/5 border-l-2 border-primary' : 'bg-muted'
              }`}
            >
              <div className="text-xs text-muted-foreground mb-1">
                {msg.is_from_admin ? 'Suporte' : 'Eu'} — {new Date(msg.created_at).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </div>
              <div className="whitespace-pre-wrap">{msg.content}</div>
            </div>
          ))}
        </div>
      )}

      {!isClosed && (
        <div className="flex gap-2">
          <Textarea
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="A sua mensagem..."
            rows={2}
            className="flex-1"
          />
          <Button onClick={handleSend} disabled={sending || !newMessage.trim()} size="icon">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      )}

      {!isClosed && isOwner && (
        <div className="flex items-center justify-end gap-2 pt-2 border-t">
          {confirmClose ? (
            <>
              <span className="text-xs text-muted-foreground">Tem a certeza? Não poderá reabrir.</span>
              <Button variant="ghost" size="sm" onClick={() => setConfirmClose(false)} disabled={closing}>
                Cancelar
              </Button>
              <Button variant="destructive" size="sm" onClick={handleClose} disabled={closing} className="gap-2">
                <XCircle className="h-4 w-4" /> Confirmar fecho
              </Button>
            </>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setConfirmClose(true)} className="gap-2">
              <XCircle className="h-4 w-4" /> Fechar ticket
            </Button>
          )}
        </div>
      )}

      {isClosed && (
        <div className="text-xs text-muted-foreground border-t pt-3">
          Ticket fechado. Para novas questões crie outro ticket.
        </div>
      )}
    </div>
  );
}
