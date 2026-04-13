import { Badge } from '@/components/ui/badge';
import type { TicketStatus, TicketPriority } from '@/types/tickets';

const STATUS_CONFIG: Record<TicketStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  open: { label: 'Ouvert', variant: 'destructive' },
  in_progress: { label: 'En cours', variant: 'default' },
  waiting_customer: { label: 'En attente', variant: 'outline' },
  resolved: { label: 'Résolu', variant: 'secondary' },
  closed: { label: 'Fermé', variant: 'secondary' },
};

const PRIORITY_CONFIG: Record<TicketPriority, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  low: { label: 'Basse', variant: 'secondary' },
  medium: { label: 'Moyenne', variant: 'outline' },
  high: { label: 'Haute', variant: 'default' },
  urgent: { label: 'Urgent', variant: 'destructive' },
};

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  const config = STATUS_CONFIG[status];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

export function TicketPriorityBadge({ priority }: { priority: TicketPriority }) {
  const config = PRIORITY_CONFIG[priority];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
