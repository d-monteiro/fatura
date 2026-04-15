import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/lib/supabase/client';
import { useI18n } from '@/contexts/I18nContext';
import { Check } from 'lucide-react';
import type { Plan } from '@/types/tenant';
import type { OnboardingData } from './onboardingTypes';

interface Props {
  data: OnboardingData;
  onChange: (updates: Partial<OnboardingData>) => void;
}

export function StepPayment({ data, onChange }: Props) {
  const { lang } = useI18n();
  const [plans, setPlans] = useState<Plan[]>([]);

  useEffect(() => {
    supabase
      .from('plans')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data: p }) => { if (p) setPlans(p as Plan[]); });
  }, []);

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
          const perMonthLabel = lang === 'en' ? '/mo' : '/mês';
          const perMonth = plan.price_yearly
            ? `${(plan.price_yearly / 100 / 12).toFixed(0)}€${perMonthLabel}`
            : null;
          const description = lang === 'en' && plan.description_en ? plan.description_en : plan.description;
          const features = lang === 'en' && plan.features_list_en ? plan.features_list_en : plan.features_list;
          const isSelected = data.selectedPlan === plan.slug;

          return (
            <Card
              key={plan.id}
              className={`cursor-pointer transition-all ${
                isSelected ? 'border-primary ring-2 ring-primary/20' : 'hover:border-primary/50'
              }`}
              onClick={() => onChange({ selectedPlan: plan.slug })}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{plan.name}</CardTitle>
                  {plan.is_popular && <Badge>Popular</Badge>}
                </div>
                <div className="text-2xl font-bold">
                  {formatPrice(price)}
                  {price !== null && (
                    <span className="text-sm font-normal text-muted-foreground">
                      /{data.billingCycle === 'yearly' ? (lang === 'en' ? 'yr' : 'ano') : (lang === 'en' ? 'mo' : 'mês')}
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
                {plan.setup_fee > 0 && (
                  <div className="mt-3 text-xs text-muted-foreground">
                    + Taxa de configuração: {formatPrice(plan.setup_fee)} (pagamento único)
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
