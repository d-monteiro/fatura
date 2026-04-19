import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { TicketStatusBadge, TicketPriorityBadge } from '@/components/tickets/StatusBadge';
import { TicketDetailDrawer } from '@/components/admin/TicketDetailDrawer';
import type { Ticket, TicketStatus } from '@/types/tickets';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { ChevronRight } from 'lucide-react';

const STATUS_FILTERS: Array<{ value: 'open_all' | TicketStatus | 'all'; label: string }> = [
  { value: 'open_all', label: 'Todos abertos' },
  { value: 'open', label: 'Abertos' },
  { value: 'in_progress', label: 'Em curso' },
  { value: 'waiting_customer', label: 'Em espera' },
  { value: 'resolved', label: 'Resolvidos' },
  { value: 'closed', label: 'Fechados' },
  { value: 'all', label: 'Todos' },
];

export default function AdminTickets() {
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [filter, setFilter] = useState<(typeof STATUS_FILTERS)[number]['value']>('open_all');

  const { data: tickets = [], isLoading } = useQuery<Ticket[]>({
    queryKey: ['admin-tickets'],
    queryFn: async () => {
      const { data, error } = await supabase.from('tickets').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Ticket[];
    },
  });

  const filtered = tickets.filter((t) => {
    if (filter === 'all') return true;
    if (filter === 'open_all') return t.status !== 'closed' && t.status !== 'resolved';
    return t.status === filter;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Tickets</h1>
          <p className="text-sm text-muted-foreground">
            {tickets.filter((t) => t.status !== 'closed' && t.status !== 'resolved').length} por resolver · {tickets.length} total
          </p>
        </div>
        <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">A carregar...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Sem tickets.</div>
      ) : (
        <div className="rounded-lg border divide-y">
          {filtered.map((ticket) => (
            <button
              key={ticket.id}
              onClick={() => setSelected(ticket)}
              className="w-full p-4 text-left hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center justify-between gap-3 mb-1">
                <span className="font-medium text-sm truncate">{ticket.subject}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <TicketPriorityBadge priority={ticket.priority} />
                  <TicketStatusBadge status={ticket.status} />
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                {new Date(ticket.created_at).toLocaleDateString('pt-PT')} · {ticket.category}
              </div>
            </button>
          ))}
        </div>
      )}

      <TicketDetailDrawer ticket={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
