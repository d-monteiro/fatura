import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { Check } from 'lucide-react';
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
    if (cents === null) return 'Sur devis';
    return `${(cents / 100).toFixed(0)}€`;
  };

  const isCurrentPlan = (plan: Plan) => currentPlan?.id === plan.id;

  return (
    <div className="space-y-4">
      <h3 className="font-semibold">Changer de plan</h3>
      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className={`rounded-lg border p-4 ${
              isCurrentPlan(plan) ? 'border-primary bg-primary/5' : ''
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold">{plan.name}</span>
              {plan.is_popular && <Badge variant="secondary">Populaire</Badge>}
              {isCurrentPlan(plan) && <Badge>Actuel</Badge>}
            </div>
            <div className="text-xl font-bold mb-2">
              {formatPrice(plan.price_monthly)}
              {plan.price_monthly !== null && <span className="text-xs font-normal text-muted-foreground">/mois</span>}
            </div>
            <ul className="space-y-1 mb-4">
              {(plan.features_list ?? []).slice(0, 4).map((f, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <Check className="h-3 w-3 text-primary mt-0.5 shrink-0" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            {!isCurrentPlan(plan) && (
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                disabled={!tenant?.stripe_customer_id}
              >
                {plan.is_custom_pricing ? 'Nous contacter' : 'Changer'}
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
