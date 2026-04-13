import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { TicketStatusBadge, TicketPriorityBadge } from './StatusBadge';
import { ArrowLeft, Send } from 'lucide-react';
import type { Ticket, TicketMessage } from '@/types/tickets';

interface Props {
  ticket: Ticket;
  onBack: () => void;
}

export function TicketDetail({ ticket, onBack }: Props) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);

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
      const { data } = await supabase.from('ticket_messages').insert({
        ticket_id: ticket.id,
        user_id: user.id,
        content: newMessage.trim(),
      }).select().single();
      if (data) setMessages((prev) => [...prev, data as TicketMessage]);
      setNewMessage('');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="font-semibold text-lg flex-1 truncate">{ticket.subject}</h2>
        <TicketStatusBadge status={ticket.status} />
        <TicketPriorityBadge priority={ticket.priority} />
      </div>

      <div className="rounded-lg border p-4 text-sm whitespace-pre-wrap">
        {ticket.description}
      </div>
      <div className="text-xs text-muted-foreground">
        Créé le {new Date(ticket.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
      </div>

      {messages.length > 0 && (
        <div className="space-y-3">
          {messages.filter((m) => !m.is_internal).map((msg) => (
            <div
              key={msg.id}
              className={`rounded-lg p-3 text-sm ${
                msg.is_from_admin ? 'bg-primary/5 border-l-2 border-primary' : 'bg-muted'
              }`}
            >
              <div className="text-xs text-muted-foreground mb-1">
                {msg.is_from_admin ? 'Support' : 'Vous'} — {new Date(msg.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </div>
              <div className="whitespace-pre-wrap">{msg.content}</div>
            </div>
          ))}
        </div>
      )}

      {ticket.status !== 'closed' && (
        <div className="flex gap-2">
          <Textarea
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Votre message..."
            rows={2}
            className="flex-1"
          />
          <Button onClick={handleSend} disabled={sending || !newMessage.trim()} size="icon">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
