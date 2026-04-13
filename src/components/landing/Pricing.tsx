import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase/client';
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import type { Plan } from '@/types/tenant';

export function Pricing() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [cycle, setCycle] = useState<'monthly' | 'yearly'>('monthly');

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

  return (
    <section id="pricing" className="py-20 bg-muted/30">
      <div className="mx-auto max-w-5xl px-4">
        <h2 className="text-3xl font-bold text-center mb-4">Tarifs simples et transparents</h2>
        <p className="text-center text-muted-foreground mb-8">
          14 jours d'essai gratuit sur tous les plans. Sans engagement.
        </p>

        <div className="flex justify-center gap-2 mb-10">
          <Button
            variant={cycle === 'monthly' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setCycle('monthly')}
          >
            Mensuel
          </Button>
          <Button
            variant={cycle === 'yearly' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setCycle('yearly')}
          >
            Annuel (-17%)
          </Button>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {plans.map((plan) => {
            const price = cycle === 'yearly' ? plan.price_yearly : plan.price_monthly;
            return (
              <div
                key={plan.id}
                className={`rounded-xl border bg-card p-6 flex flex-col ${
                  plan.is_popular ? 'border-primary ring-2 ring-primary/20 relative' : ''
                }`}
              >
                {plan.is_popular && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">Populaire</Badge>
                )}
                <h3 className="text-xl font-bold">{plan.name}</h3>
                <div className="mt-2 text-3xl font-bold">
                  {formatPrice(price)}
                  {price !== null && (
                    <span className="text-base font-normal text-muted-foreground">
                      /{cycle === 'yearly' ? 'an' : 'mois'}
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm text-muted-foreground flex-grow">{plan.description}</p>

                <ul className="mt-6 space-y-2">
                  {(plan.features_list ?? []).map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  asChild
                  className="mt-6 w-full"
                  variant={plan.is_popular ? 'default' : 'outline'}
                >
                  <Link to="/onboarding">{plan.cta_label}</Link>
                </Button>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
