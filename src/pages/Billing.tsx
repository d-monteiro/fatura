import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useTenant } from '@/contexts/TenantContext';
import { UsageMeter } from '@/components/billing/UsageMeter';
import { PlanSelector } from '@/components/billing/PlanSelector';
import { CheckoutCancelDialog } from '@/components/billing/CheckoutCancelDialog';
import { openBillingPortal } from '@/lib/stripe/checkout';
import { isUnlimitedTrial } from '@/lib/utils/trial';
import { Sparkles, Clock, Infinity as InfinityIcon, CreditCard, Loader2 } from 'lucide-react';

export default function Billing() {
  const { tenant, plan, refreshTenant } = useTenant();
  const [params, setParams] = useSearchParams();
  const [portalLoading, setPortalLoading] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [nowAtMount] = useState(() => Date.now());

  useEffect(() => {
    const result = params.get('checkout');
    if (!result) return;
    if (result === 'success') {
      toast.success('Pagamento concluído. A subscrição será activada em instantes.');
      void refreshTenant();
    } else if (result === 'cancel') {
      setCancelOpen(true);
    }
    params.delete('checkout');
    params.delete('session_id');
    setParams(params, { replace: true });
  }, [params, setParams, refreshTenant]);

  const trialEndsAt = tenant?.trial_ends_at ?? null;
  const unlimitedTrial = isUnlimitedTrial(trialEndsAt);
  const { trialEnds, daysLeft } = useMemo(() => {
    if (!trialEndsAt || unlimitedTrial) return { trialEnds: null, daysLeft: null };
    const d = new Date(trialEndsAt);
    return {
      trialEnds: d,
      daysLeft: Math.max(0, Math.ceil((d.getTime() - nowAtMount) / 86_400_000)),
    };
  }, [trialEndsAt, nowAtMount, unlimitedTrial]);

  const onPortal = async () => {
    setPortalLoading(true);
    try {
      await openBillingPortal();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao abrir portal');
      setPortalLoading(false);
    }
  };

  const hasCustomer = !!tenant?.stripe_customer_id;

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
            {unlimitedTrial && !hasCustomer && (
              <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                <InfinityIcon className="h-3.5 w-3.5" />
                <span className="font-medium text-foreground">Teste grátis com duração indefinida</span>
              </p>
            )}
            {trialEnds && !hasCustomer && (
              <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                Teste grátis até {trialEnds.toLocaleDateString('pt-PT')}
                {daysLeft !== null && daysLeft > 0 && (
                  <span className="font-medium text-foreground">· {daysLeft} {daysLeft === 1 ? 'dia' : 'dias'} restantes</span>
                )}
              </p>
            )}
            {hasCustomer && (
              <Button
                variant="outline"
                size="sm"
                onClick={onPortal}
                disabled={portalLoading}
                className="gap-2 mt-2"
              >
                {portalLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CreditCard className="h-3.5 w-3.5" />}
                Gerir subscrição e pagamentos
              </Button>
            )}
          </div>
          <div className="md:min-w-[280px]">
            <UsageMeter />
          </div>
        </div>
      </section>

      <PlanSelector />

      <CheckoutCancelDialog open={cancelOpen} onOpenChange={setCancelOpen} />
    </div>
  );
}
