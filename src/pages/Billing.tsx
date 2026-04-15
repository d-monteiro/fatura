import { useTenant } from '@/contexts/TenantContext';
import { UsageMeter } from '@/components/billing/UsageMeter';
import { PlanSelector } from '@/components/billing/PlanSelector';
import { Sparkles, Clock, Info } from 'lucide-react';

export default function Billing() {
  const { tenant, plan } = useTenant();
  const trialEnds = tenant?.trial_ends_at ? new Date(tenant.trial_ends_at) : null;
  const daysLeft = trialEnds ? Math.max(0, Math.ceil((trialEnds.getTime() - Date.now()) / 86_400_000)) : null;

  return (
    <div className="max-w-6xl mx-auto p-6 md:p-8 space-y-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Faturação</h1>
        <p className="text-muted-foreground mt-1">Gira a sua subscrição e utilização.</p>
      </header>

      <section className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/10 via-primary/5 to-background p-6 md:p-8">
        <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Plano atual
            </div>
            <h2 className="text-4xl font-bold tracking-tight">{plan?.name ?? 'Sem plano'}</h2>
            {trialEnds && (
              <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                Teste grátis até {trialEnds.toLocaleDateString('pt-PT')}
                {daysLeft !== null && daysLeft > 0 && (
                  <span className="font-medium text-foreground">· {daysLeft} {daysLeft === 1 ? 'dia' : 'dias'} restantes</span>
                )}
              </p>
            )}
          </div>
          <div className="md:min-w-[280px]">
            <UsageMeter />
          </div>
        </div>
      </section>

      <PlanSelector />

      {!tenant?.stripe_customer_id && (
        <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
          <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <p className="text-muted-foreground">
            A integração com Stripe está a ser preparada. As alterações de plano ficarão disponíveis assim que a faturação online for ativada — contacte-nos entretanto se precisar de mudar de plano.
          </p>
        </div>
      )}
    </div>
  );
}
