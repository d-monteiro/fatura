import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CURRENCIES, type OnboardingData } from './onboardingTypes';
import { useAuth } from '@/contexts/AuthContext';
import { Cloud, Mail, FileSpreadsheet, BarChart3 } from 'lucide-react';

interface Props {
  data: OnboardingData;
  onChange: (updates: Partial<OnboardingData>) => void;
}

const REPORT_OPTIONS = [
  { value: 'never', label: 'Nunca' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'monthly', label: 'Mensal' },
] as const;

export function StepConfiguracao({ data, onChange }: Props) {
  const { user } = useAuth();
  const reportTarget = user?.email ?? 'o email da tua conta';

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Configuração</h2>
        <p className="text-muted-foreground">
          Decida como quer arrumar as faturas, receber relatórios e automatizar o Gmail. Tudo é alterável depois.
        </p>
      </header>

      <SectionCard icon={<Cloud className="h-4 w-4" />} title="Armazenamento" subtitle="Onde guardar os ficheiros">
        <div className="space-y-3">
          <div className="rounded-lg border-2 border-primary bg-primary/5 px-4 py-3 flex items-center gap-3">
            <Cloud className="h-5 w-5 text-primary shrink-0" />
            <div className="flex-1">
              <div className="font-medium text-sm">Google Drive</div>
              <div className="text-xs text-muted-foreground">Pastas organizadas por ano e mês. Ligação no fim do onboarding.</div>
            </div>
          </div>
          <label className="flex items-center justify-between rounded-lg border px-4 py-3 cursor-pointer hover:bg-muted/40">
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              <div>
                <div className="font-medium text-sm">Extrato automático em Sheets</div>
                <div className="text-xs text-muted-foreground">Cada fatura escrita numa folha de cálculo mensal.</div>
              </div>
            </div>
            <input
              type="checkbox"
              checked={data.autoSheets}
              onChange={(e) => onChange({ autoSheets: e.target.checked })}
              className="h-5 w-5 rounded"
            />
          </label>
        </div>
      </SectionCard>

      <SectionCard icon={<BarChart3 className="h-4 w-4" />} title="Relatórios e moeda" subtitle="O que aparece no dashboard e o que recebe por email">
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
            <Label>Relatórios automáticos por email</Label>
            <div className="grid grid-cols-3 gap-2">
              {REPORT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onChange({ autoReports: opt.value })}
                  className={`text-sm py-2 rounded-lg border-2 transition-colors ${
                    data.autoReports === opt.value
                      ? 'border-primary bg-primary/5 text-primary font-medium'
                      : 'border-muted hover:border-primary/50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {data.autoReports !== 'never' && (
            <p className="text-xs text-muted-foreground">
              Vamos enviar para <strong className="text-foreground">{reportTarget}</strong>. Podes mudar ou adicionar destinatários em Definições → Relatórios.
            </p>
          )}
        </div>
      </SectionCard>

      <SectionCard icon={<Mail className="h-4 w-4" />} title="Gmail automático" subtitle="Faturas chegam ao email — nós tratamos do resto">
        <label className="flex items-center justify-between rounded-lg border px-4 py-3 cursor-pointer hover:bg-muted/40">
          <div className="flex items-center gap-3">
            <Mail className="h-5 w-5 text-primary" />
            <div>
              <div className="font-medium text-sm">Sincronização diária do Gmail</div>
              <div className="text-xs text-muted-foreground">Procura faturas nos anexos todos os dias à meia-noite.</div>
            </div>
          </div>
          <input
            type="checkbox"
            checked={data.emailSync}
            onChange={(e) => onChange({ emailSync: e.target.checked })}
            className="h-5 w-5 rounded"
          />
        </label>
        <p className="text-xs text-muted-foreground mt-2">
          A ligação ao Google é feita após criar a conta — usa o mesmo login.
        </p>
      </SectionCard>
    </div>
  );
}

function SectionCard({ icon, title, subtitle, children }: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-card shadow-sm">
      <div className="flex items-center gap-3 border-b bg-muted/30 rounded-t-xl px-5 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </div>
        <div>
          <h3 className="font-semibold text-sm">{title}</h3>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}
