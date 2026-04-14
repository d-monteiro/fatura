import { Badge } from '@/components/ui/badge';
import type { TicketStatus, TicketPriority } from '@/types/tickets';

const STATUS_CONFIG: Record<TicketStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  open: { label: 'Aberto', variant: 'destructive' },
  in_progress: { label: 'Em curso', variant: 'default' },
  waiting_customer: { label: 'Em espera', variant: 'outline' },
  resolved: { label: 'Resolvido', variant: 'secondary' },
  closed: { label: 'Fechado', variant: 'secondary' },
};

const PRIORITY_CONFIG: Record<TicketPriority, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  low: { label: 'Baixa', variant: 'secondary' },
  medium: { label: 'Média', variant: 'outline' },
  high: { label: 'Alta', variant: 'default' },
  urgent: { label: 'Urgente', variant: 'destructive' },
};

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  const config = STATUS_CONFIG[status];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

export function TicketPriorityBadge({ priority }: { priority: TicketPriority }) {
  const config = PRIORITY_CONFIG[priority];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
