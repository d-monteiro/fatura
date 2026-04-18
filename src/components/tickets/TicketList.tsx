import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { TicketStatusBadge, TicketPriorityBadge } from './StatusBadge';
import type { Ticket } from '@/types/tickets';

interface Props {
  onSelect: (ticket: Ticket) => void;
}

export function TicketList({ onSelect }: Props) {
  const { tenant } = useTenant();
  const tenantId = tenant?.id ?? null;

  const { data: tickets = [], isLoading: loading } = useQuery<Ticket[]>({
    queryKey: ['tickets', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data } = await supabase
        .from('tickets')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });
      return (data as Ticket[] | null) ?? [];
    },
    enabled: !!tenantId,
  });

  if (loading) {
    return <div className="text-sm text-muted-foreground p-4">A carregar...</div>;
  }

  if (tickets.length === 0) {
    return (
      <div className="text-center text-sm text-muted-foreground py-12">
        Nenhum ticket de momento.
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
          <div className="flex items-center justify-between gap-3 mb-1">
            <span className="font-medium text-sm truncate flex-1 min-w-0">{ticket.subject}</span>
            <span className="shrink-0">
              <TicketStatusBadge status={ticket.status} />
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
            <TicketPriorityBadge priority={ticket.priority} />
            <span className="truncate">{new Date(ticket.created_at).toLocaleDateString('pt-PT')}</span>
          </div>
        </button>
      ))}
    </div>
  );
}
