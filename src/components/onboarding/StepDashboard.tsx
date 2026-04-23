import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CURRENCIES, type OnboardingData } from './onboardingTypes';

interface Props {
  data: OnboardingData;
  onChange: (updates: Partial<OnboardingData>) => void;
}

const REPORT_OPTIONS = [
  { value: 'never', label: 'Nunca', desc: 'Sem relatórios automáticos' },
  { value: 'weekly', label: 'Semanal', desc: 'Recebe segunda de manhã, sobre a semana anterior' },
  { value: 'monthly', label: 'Mensal', desc: 'Recebe dia 1 de cada mês, sobre o mês anterior' },
] as const;

export function StepDashboard({ data, onChange }: Props) {
  const needsEmail = data.autoReports !== 'never';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Dashboard e relatórios</h2>
        <p className="text-muted-foreground mt-1">Personalize o seu painel de controlo.</p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Moeda principal</Label>
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
          <Label>Relatórios automáticos</Label>
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

        {needsEmail && (
          <div className="space-y-2">
            <Label htmlFor="report-email">Email para receber o relatório</Label>
            <Input
              id="report-email"
              type="email"
              placeholder="Deixe vazio para usar o email da conta"
              value={data.reportEmail}
              onChange={(e) => onChange({ reportEmail: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Se deixar vazio, o relatório vai para o email com que criou a conta.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
