import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { NewTicketForm } from '@/components/tickets/NewTicketForm';
import { supabase } from '@/lib/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { AlertCircle, LifeBuoy, LogOut } from 'lucide-react';

export default function AccountSuspended() {
  const { tenant } = useTenant();
  const [open, setOpen] = useState(false);

  const handleLogout = async () => { await supabase.auth.signOut(); };
  const handleCreated = () => {
    setOpen(false);
    toast.success('Pedido enviado. Vamos contactar-te em breve.');
  };

  // Se o utilizador não tem tenant (caso raro nesta página), o NewTicketForm
  // não pode escrever — escondemos o botão e oferecemos só logout.
  const canSubmitTicket = !!tenant;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 shadow-sm text-center space-y-5">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertCircle className="h-7 w-7" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">Conta suspensa</h1>
          <p className="text-sm text-muted-foreground">
            O acesso à sua conta foi temporariamente suspenso. Para retomar o serviço ou obter esclarecimentos, contacte a equipa de suporte.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          {canSubmitTicket && (
            <Button className="gap-2" onClick={() => setOpen(true)}>
              <LifeBuoy className="h-4 w-4" />
              Contactar suporte
            </Button>
          )}
          <Button variant="outline" className="gap-2" onClick={handleLogout}>
            <LogOut className="h-4 w-4" />
            Terminar sessão
          </Button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Pedido de suporte</DialogTitle>
            <DialogDescription>
              A nossa equipa responde directamente ao email da tua conta. Inclui o máximo de detalhe possível para acelerar a resolução.
            </DialogDescription>
          </DialogHeader>
          <NewTicketForm
            onCreated={handleCreated}
            onCancel={() => setOpen(false)}
            preset={{
              category: 'billing',
              priority: 'high',
              subject: 'Conta suspensa',
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
