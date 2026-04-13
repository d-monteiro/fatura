import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { TicketStatusBadge, TicketPriorityBadge } from './StatusBadge';
import type { Ticket } from '@/types/tickets';

interface Props {
  onSelect: (ticket: Ticket) => void;
}

export function TicketList({ onSelect }: Props) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('tickets')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) setTickets(data as Ticket[]);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <div className="text-sm text-muted-foreground p-4">Chargement...</div>;
  }

  if (tickets.length === 0) {
    return (
      <div className="text-center text-sm text-muted-foreground py-12">
        Aucun ticket pour le moment.
      </div>
    );
  }

  return (
    <div className="divide-y">
      {tickets.map((ticket) => (
        <button
          key={ticket.id}
          onClick={() => onSelect(ticket)}
          className="w-full text-left p-4 hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="font-medium text-sm truncate">{ticket.subject}</span>
            <TicketStatusBadge status={ticket.status} />
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <TicketPriorityBadge priority={ticket.priority} />
            <span>{new Date(ticket.created_at).toLocaleDateString('fr-FR')}</span>
          </div>
        </button>
      ))}
    </div>
  );
}
