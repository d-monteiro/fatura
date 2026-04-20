import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase/client';
import { AlertCircle, LifeBuoy, LogOut } from 'lucide-react';

export default function AccountSuspended() {
  const handleLogout = async () => { await supabase.auth.signOut(); };

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
          <Button asChild className="gap-2">
            <a href="mailto:suporte@flowzi.pt?subject=Conta%20suspensa%20%E2%80%94%20FaturaAI">
              <LifeBuoy className="h-4 w-4" />
              Contactar suporte
            </a>
          </Button>
          <Button variant="outline" className="gap-2" onClick={handleLogout}>
            <LogOut className="h-4 w-4" />
            Terminar sessão
          </Button>
        </div>
      </div>
    </div>
  );
}
