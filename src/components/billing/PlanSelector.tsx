import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { Check, Sparkles, CheckCircle2 } from 'lucide-react';
import type { Plan } from '@/types/tenant';

export function PlanSelector() {
  const { plan: currentPlan, tenant } = useTenant();
  const [plans, setPlans] = useState<Plan[]>([]);

  useEffect(() => {
    supabase
      .from('plans')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => { if (data) setPlans(data as Plan[]); });
  }, []);

  const formatPrice = (cents: number | null) => {
    if (cents === null) return null;
    return (cents / 100).toFixed(0);
  };

  const isCurrentPlan = (plan: Plan) => currentPlan?.id === plan.id;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Escolha o seu plano</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Mude a qualquer momento. Sem penalizações.
        </p>
      </div>
      <div className="grid gap-5 md:grid-cols-3">
        {plans.map((plan) => {
          const current = isCurrentPlan(plan);
          const price = formatPrice(plan.price_monthly);
          return (
            <div
              key={plan.id}
              className={`relative rounded-2xl border bg-card p-6 flex flex-col transition-all ${
                plan.is_popular
                  ? 'border-primary shadow-lg shadow-primary/10 md:-translate-y-2'
                  : 'hover:shadow-md hover:-translate-y-0.5'
              } ${current ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}`}
            >
              {plan.is_popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary text-primary-foreground px-3 py-1 text-[11px] font-semibold uppercase tracking-wider shadow">
                    <Sparkles className="h-3 w-3" />
                    Mais popular
                  </span>
                </div>
              )}
              {current && (
                <div className="absolute top-4 right-4">
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[11px] font-semibold">
                    <CheckCircle2 className="h-3 w-3" />
                    Atual
                  </span>
                </div>
              )}

              <div className="space-y-1">
                <h3 className="text-lg font-semibold">{plan.name}</h3>
                {plan.description && (
                  <p className="text-xs text-muted-foreground">{plan.description}</p>
                )}
              </div>

              <div className="mt-5 mb-6">
                {price !== null ? (
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold tracking-tight">{price}€</span>
                    <span className="text-sm text-muted-foreground">/mês</span>
                  </div>
                ) : (
                  <div className="text-2xl font-bold tracking-tight">Sob orçamento</div>
                )}
              </div>

              <ul className="space-y-2.5 mb-6 flex-1">
                {(plan.features_list ?? []).map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <span className="text-foreground/80">{f}</span>
                  </li>
                ))}
              </ul>

              <Button
                variant={plan.is_popular && !current ? 'default' : 'outline'}
                className="w-full"
                disabled={current || !tenant?.stripe_customer_id}
              >
                {current
                  ? 'Plano atual'
                  : plan.is_custom_pricing
                    ? 'Contactar-nos'
                    : 'Escolher plano'}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
