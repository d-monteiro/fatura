import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CURRENCIES, type OnboardingData } from './onboardingTypes';

interface Props {
  data: OnboardingData;
  onChange: (updates: Partial<OnboardingData>) => void;
}

const REPORT_OPTIONS = [
  { value: 'never', label: 'Jamais', desc: 'Pas de rapports automatiques' },
  { value: 'weekly', label: 'Hebdomadaire', desc: 'Rapport envoyé chaque lundi' },
  { value: 'monthly', label: 'Mensuel', desc: 'Rapport envoyé le 1er de chaque mois' },
] as const;

export function StepDashboard({ data, onChange }: Props) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Dashboard et rapports</h2>
        <p className="text-muted-foreground mt-1">Personnalisez votre tableau de bord.</p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Devise principale</Label>
          <Select value={data.currency} onValueChange={(v) => onChange({ currency: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Rapports automatiques</Label>
          <div className="space-y-2">
            {REPORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => onChange({ autoReports: opt.value })}
                className={`w-full text-left p-3 rounded-lg border-2 transition-colors ${
                  data.autoReports === opt.value
                    ? 'border-primary bg-primary/5'
                    : 'border-muted hover:border-primary/50'
                }`}
              >
                <div className="font-medium text-sm">{opt.label}</div>
                <div className="text-xs text-muted-foreground">{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
