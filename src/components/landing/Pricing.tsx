import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase/client';
import { Link } from 'react-router-dom';
import { Check, ArrowRight } from 'lucide-react';
import { track } from '@/lib/analytics/track';
import { EVENTS } from '@/lib/analytics/events';
import { formatEur } from '@/lib/utils/format';
import type { Plan } from '@/types/tenant';
import type { BillingCycle } from '@/types/billing';

export function Pricing() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [cycle, setCycle] = useState<BillingCycle>('monthly');

  useEffect(() => {
    supabase
      .from('plans')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => { if (data) setPlans(data as Plan[]); });
  }, []);

  const formatPrice = (cents: number | null) => formatEur(cents) ?? 'Sob orçamento';

  return (
    <section id="pricing" className="border-y border-border bg-card py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <div className="inline-flex items-center rounded-full border border-border bg-background px-3 py-1 text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
            Preços
          </div>
          <h2 className="mt-6 text-4xl font-bold leading-[1.05] tracking-tighter text-primary md:text-5xl">
            Começa em 0 EUR durante 7 dias.
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
            Paga só se ficar. Sem cartão exigido para começar. Cancele quando quiser.
          </p>
        </div>

        <div className="mt-10 flex justify-center">
          <div className="inline-flex items-center rounded-full border border-border bg-background p-1 text-sm">
            <button
              onClick={() => {
                setCycle('monthly');
                track(EVENTS.LANDING_PRICING_CYCLE_CHANGED, { cycle: 'monthly' });
              }}
              className={`h-9 rounded-full px-4 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${cycle === 'monthly' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-primary'}`}
            >
              Mensal
            </button>
            <button
              onClick={() => {
                setCycle('yearly');
                track(EVENTS.LANDING_PRICING_CYCLE_CHANGED, { cycle: 'yearly' });
              }}
              className={`h-9 rounded-full px-4 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${cycle === 'yearly' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-primary'}`}
            >
              Anual
              <span className={`ml-2 text-[10px] font-semibold uppercase tracking-wider ${cycle === 'yearly' ? 'text-accent' : 'text-accent'}`}>
                −17%
              </span>
            </button>
          </div>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => {
            const price = cycle === 'yearly' ? plan.price_yearly : plan.price_monthly;
            return (
              <div
                key={plan.id}
                className={`relative flex flex-col rounded-2xl border p-8 min-w-0 transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                  plan.is_popular
                    ? 'border-primary bg-background shadow-[0_30px_60px_-20px_rgba(14,36,53,0.25)] lg:-my-4'
                    : 'border-border bg-background hover:-translate-y-[2px] hover:border-primary/20'
                }`}
              >
                {plan.is_popular && (
                  <div className="absolute -top-3 left-8 inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-accent-foreground">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                    Mais escolhido
                  </div>
                )}
                <h3 className="text-xl font-semibold text-primary">{plan.name}</h3>
                <p className="mt-1 min-h-[2.5rem] text-sm text-muted-foreground">{plan.description}</p>

                <div className="mt-6 flex items-baseline gap-1">
                  <span className="font-mono text-5xl font-bold tracking-tighter text-primary">
                    {formatPrice(price)}
                  </span>
                  {price !== null && (
                    <span className="text-sm text-muted-foreground">
                      /{cycle === 'yearly' ? 'ano' : 'mês'}
                    </span>
                  )}
                </div>

                <ul className="mt-8 flex-1 space-y-3">
                  {(plan.features_list ?? []).map((f, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm text-primary">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" strokeWidth={2.5} />
                      <span className="leading-relaxed break-words min-w-0">{f}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  asChild
                  className={`group mt-8 h-12 w-full rounded-full ${
                    plan.is_popular
                      ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                      : 'border border-border bg-background text-primary hover:bg-primary hover:text-primary-foreground'
                  }`}
                >
                  <Link
                    to="/onboarding"
                    onClick={() => track(EVENTS.LANDING_CTA_CLICKED, {
                      location: 'pricing',
                      plan: plan.slug,
                      cycle,
                    })}
                    className="inline-flex items-center gap-2"
                  >
                    {plan.is_custom_pricing ? plan.cta_label : 'Começar 7 dias grátis'}
                    <ArrowRight className="h-4 w-4 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-0.5" />
                  </Link>
                </Button>
              </div>
            );
          })}
        </div>

        <p className="mt-10 text-center text-sm text-muted-foreground">
          Todos os planos incluem 7 dias grátis sem cartão. Cancele a qualquer momento, sem pagar nada.
        </p>
      </div>
    </section>
  );
}
