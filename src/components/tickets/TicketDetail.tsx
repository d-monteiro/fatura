import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { TicketPriorityBadge } from './StatusBadge';
import {
  ArrowLeft, Send, XCircle, CheckCircle2, Clock, MessageCircle, Sparkles, Headphones,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Ticket, TicketMessage, TicketStatus } from '@/types/tickets';

interface Props {
  ticket: Ticket;
  onBack: () => void;
  onChanged?: () => void;
}

type Tone = 'amber' | 'blue' | 'purple' | 'emerald' | 'green';

const STATUS_DISPLAY: Record<TicketStatus, {
  icon: typeof CheckCircle2;
  title: string;
  description: string;
  tone: Tone;
}> = {
  open: {
    icon: Clock,
    title: 'À espera da equipa',
    description: 'O seu ticket foi recebido. A equipa de suporte vai analisar em breve.',
    tone: 'amber',
  },
  in_progress: {
    icon: Sparkles,
    title: 'A equipa está a analisar',
    description: 'Alguém da equipa já está a trabalhar no seu pedido.',
    tone: 'blue',
  },
  waiting_customer: {
    icon: MessageCircle,
    title: 'Aguarda a sua resposta',
    description: 'A equipa pediu mais informação. Responda para continuarmos.',
    tone: 'purple',
  },
  resolved: {
    icon: CheckCircle2,
    title: 'Resolvido pela equipa',
    description: 'Se estiver satisfeito com a resposta, confirme a resolução. Se não, responda para continuarmos.',
    tone: 'emerald',
  },
  closed: {
    icon: CheckCircle2,
    title: 'Ticket fechado e resolvido',
    description: 'Este ticket já foi resolvido pela equipa de suporte. Para novas questões, crie outro ticket.',
    tone: 'green',
  },
};

const TONE_CLASSES: Record<Tone, { wrap: string; icon: string; title: string; body: string }> = {
  amber: {
    wrap: 'border-amber-200 bg-amber-50',
    icon: 'text-amber-600 bg-amber-100',
    title: 'text-amber-900',
    body: 'text-amber-800',
  },
  blue: {
    wrap: 'border-blue-200 bg-blue-50',
    icon: 'text-blue-600 bg-blue-100',
    title: 'text-blue-900',
    body: 'text-blue-800',
  },
  purple: {
    wrap: 'border-purple-200 bg-purple-50',
    icon: 'text-purple-600 bg-purple-100',
    title: 'text-purple-900',
    body: 'text-purple-800',
  },
  emerald: {
    wrap: 'border-emerald-200 bg-emerald-50',
    icon: 'text-emerald-600 bg-emerald-100',
    title: 'text-emerald-900',
    body: 'text-emerald-800',
  },
  green: {
    wrap: 'border-green-200 bg-green-50',
    icon: 'text-green-600 bg-green-100',
    title: 'text-green-900',
    body: 'text-green-800',
  },
};

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

  const isOwner = user?.id === ticket.user_id;
  const isClosed = status === 'closed';
  const isResolved = status === 'resolved';
  const canClose = isOwner && !isClosed;
  const display = STATUS_DISPLAY[status];
  const tone = TONE_CLASSES[display.tone];
  const StatusIcon = display.icon;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="font-semibold text-lg flex-1 min-w-0 truncate">{ticket.subject}</h2>
        <TicketPriorityBadge priority={ticket.priority} />
      </div>

      <div className={`rounded-xl border p-4 flex items-start gap-3 ${tone.wrap}`}>
        <div className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${tone.icon}`}>
          <StatusIcon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0 pt-0.5">
          <div className={`font-semibold text-[15px] ${tone.title}`}>{display.title}</div>
          <div className={`text-sm mt-1 leading-relaxed ${tone.body}`}>{display.description}</div>
        </div>
      </div>

      <div>
        <div className="rounded-lg border p-4 text-sm whitespace-pre-wrap break-words bg-muted/30">
          {ticket.description}
        </div>
        <div className="text-xs text-muted-foreground mt-2">
          Enviado a {new Date(ticket.created_at).toLocaleDateString('pt-PT', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </div>
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
              <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1.5">
                {msg.is_from_admin && <Headphones className="h-3 w-3" />}
                <span className="font-medium">{msg.is_from_admin ? 'Suporte' : 'Eu'}</span>
                <span aria-hidden>·</span>
                <span>{new Date(msg.created_at).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
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

      {canClose && (
        <div className="flex items-center justify-end gap-2 pt-2 border-t">
          {confirmClose ? (
            <>
              <span className="text-xs text-muted-foreground">Tem a certeza? Não poderá reabrir.</span>
              <Button variant="ghost" size="sm" onClick={() => setConfirmClose(false)} disabled={closing}>
                Cancelar
              </Button>
              <Button variant={isResolved ? 'default' : 'destructive'} size="sm" onClick={handleClose} disabled={closing} className="gap-2">
                {isResolved ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                Confirmar
              </Button>
            </>
          ) : (
            <Button
              variant={isResolved ? 'default' : 'outline'}
              size="sm"
              onClick={() => setConfirmClose(true)}
              className="gap-2"
            >
              {isResolved ? (
                <><CheckCircle2 className="h-4 w-4" /> Confirmar resolução</>
              ) : (
                <><XCircle className="h-4 w-4" /> Fechar ticket</>
              )}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
