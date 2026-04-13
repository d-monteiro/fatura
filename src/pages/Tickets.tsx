import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { TicketList } from '@/components/tickets/TicketList';
import { TicketDetail } from '@/components/tickets/TicketDetail';
import { NewTicketForm } from '@/components/tickets/NewTicketForm';
import { Plus } from 'lucide-react';
import type { Ticket } from '@/types/tickets';

type View = 'list' | 'detail' | 'new';

export default function Tickets() {
  const [view, setView] = useState<View>('list');
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleSelect = (ticket: Ticket) => {
    setSelectedTicket(ticket);
    setView('detail');
  };

  const handleCreated = () => {
    setView('list');
    setRefreshKey((k) => k + 1);
  };

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Support</h1>
          <p className="text-muted-foreground">Vos tickets et demandes d'aide.</p>
        </div>
        {view === 'list' && (
          <Button onClick={() => setView('new')} className="gap-2">
            <Plus className="h-4 w-4" /> Nouveau ticket
          </Button>
        )}
      </div>

      <div className="rounded-lg border">
        {view === 'list' && (
          <TicketList key={refreshKey} onSelect={handleSelect} />
        )}
        {view === 'detail' && selectedTicket && (
          <div className="p-4">
            <TicketDetail ticket={selectedTicket} onBack={() => setView('list')} />
          </div>
        )}
        {view === 'new' && (
          <div className="p-4">
            <NewTicketForm onCreated={handleCreated} onCancel={() => setView('list')} />
          </div>
        )}
      </div>
    </div>
  );
}
