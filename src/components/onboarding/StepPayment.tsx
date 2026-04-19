import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/lib/supabase/client';
import { Check, Sparkles } from 'lucide-react';
import type { Plan } from '@/types/tenant';
import type { OnboardingData } from './onboardingTypes';

interface Props {
  data: OnboardingData;
  onChange: (updates: Partial<OnboardingData>) => void;
}

export function StepPayment({ data, onChange }: Props) {
  const [plans, setPlans] = useState<Plan[]>([]);

  useEffect(() => {
    supabase
      .from('plans')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data: p }) => { if (p) setPlans(p as Plan[]); });
  }, []);

  const needsPro =
    data.invoicesPerMonth > 100 ||
    data.emailSync ||
    data.autoReports !== 'never' ||
    data.documentTypes.length > 2;
  const recommendedSlug = needsPro ? 'pro' : 'starter';
  const recommendedPlan = plans.find((p) => p.slug === recommendedSlug);
  const companyLabel = data.companyName.trim() || 'sua empresa';

  // Pre-selecionar o recomendado quando o user chega a este step sem escolha prévia.
  useEffect(() => {
    if (!recommendedPlan || data.selectedPlan) return;
    onChange({ selectedPlan: recommendedPlan.slug });
  }, [recommendedPlan, data.selectedPlan, onChange]);

  const formatPrice = (cents: number | null) => {
    if (cents === null) return 'Sob orçamento';
    return `${(cents / 100).toFixed(0)}€`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Escolha o seu plano</h2>
        <p className="text-muted-foreground mt-1">7 dias de teste grátis, sem compromisso.</p>
      </div>

      {recommendedPlan && (
        <div className="mx-auto max-w-md rounded-xl border border-primary/20 bg-primary/5 px-6 py-4 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-primary">Recomendação</p>
          <p className="mt-1.5 text-base text-foreground">
            Com base no perfil da <span className="font-semibold">{companyLabel}</span>, recomendamos o{' '}
            <span className="font-semibold text-primary">{recommendedPlan.name}</span>.
          </p>
        </div>
      )}

      <div className="flex justify-center gap-2 mb-4">
        <Button
          variant={data.billingCycle === 'monthly' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onChange({ billingCycle: 'monthly' })}
        >
          Mensal
        </Button>
        <Button
          variant={data.billingCycle === 'yearly' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onChange({ billingCycle: 'yearly' })}
        >
          Anual (-17%)
        </Button>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        {plans.map((plan) => {
          const price = data.billingCycle === 'yearly' ? plan.price_yearly : plan.price_monthly;
          const perMonth = plan.price_yearly
            ? `${(plan.price_yearly / 100 / 12).toFixed(0)}€/mês`
            : null;
          const description = plan.description;
          const features = plan.features_list;
          const isSelected = data.selectedPlan === plan.slug;
          const isRecommended = plan.slug === recommendedSlug;

          const cardClasses = isSelected
            ? 'border-primary ring-2 ring-primary/25 shadow-md'
            : isRecommended
              ? 'border-primary/60 shadow-sm hover:border-primary hover:shadow-md'
              : 'hover:border-primary/50';

          return (
            <Card
              key={plan.id}
              className={`cursor-pointer transition-all ${cardClasses}`}
              onClick={() => onChange({ selectedPlan: plan.slug })}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{plan.name}</CardTitle>
                  {isRecommended ? (
                    <Badge className="gap-1">
                      <Sparkles className="h-3 w-3" />
                      Recomendado para si
                    </Badge>
                  ) : plan.is_popular ? (
                    <Badge variant="secondary">Popular</Badge>
                  ) : null}
                </div>
                <div className="text-2xl font-bold">
                  {formatPrice(price)}
                  {price !== null && (
                    <span className="text-sm font-normal text-muted-foreground">
                      /{data.billingCycle === 'yearly' ? 'ano' : 'mês'}
                    </span>
                  )}
                </div>
                {data.billingCycle === 'yearly' && perMonth && price !== null && (
                  <div className="text-xs text-muted-foreground">{perMonth}</div>
                )}
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-3">{description}</p>
                <ul className="space-y-1.5">
                  {(features ?? []).map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
