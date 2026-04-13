import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { TicketStatusBadge, TicketPriorityBadge } from '@/components/tickets/StatusBadge';
import type { Ticket } from '@/types/tickets';

export default function AdminTickets() {
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

  if (loading) return <div className="text-muted-foreground">Chargement...</div>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Tickets</h1>
      <p className="text-muted-foreground">{tickets.filter((t) => t.status !== 'closed').length} ticket(s) ouvert(s)</p>

      <div className="rounded-lg border divide-y">
        {tickets.map((ticket) => (
          <div key={ticket.id} className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="font-medium text-sm">{ticket.subject}</span>
              <div className="flex items-center gap-2">
                <TicketPriorityBadge priority={ticket.priority} />
                <TicketStatusBadge status={ticket.status} />
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              {new Date(ticket.created_at).toLocaleDateString('fr-FR')} &middot; {ticket.category}
            </div>
          </div>
        ))}
        {tickets.length === 0 && (
          <div className="text-center py-12 text-muted-foreground text-sm">Aucun ticket.</div>
        )}
      </div>
    </div>
  );
}
