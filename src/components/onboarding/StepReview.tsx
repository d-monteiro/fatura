import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SECTORS, EU_COUNTRIES, DOCUMENT_TYPES, type OnboardingData } from './onboardingTypes';
import { Pencil, Sparkles } from 'lucide-react';

interface Props {
  data: OnboardingData;
  onGoToStep: (step: number) => void;
}

function Section({ title, step, onEdit, children }: {
  title: string; step: number; onEdit: (s: number) => void; children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Button variant="ghost" size="sm" onClick={() => onEdit(step)} className="h-7 gap-1 text-xs">
          <Pencil className="h-3 w-3" /> Editar
        </Button>
      </CardHeader>
      <CardContent className="px-4 pb-3 text-sm space-y-1">{children}</CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value || '—'}</span>
    </div>
  );
}

const REPORT_LABELS: Record<string, string> = {
  never: 'Desativados',
  weekly: 'Semanais',
  monthly: 'Mensais',
};

export function StepReview({ data, onGoToStep }: Props) {
  const country = EU_COUNTRIES.find((c) => c.value === data.country)?.label ?? data.country;
  const sector = SECTORS.find((s) => s.value === data.sector)?.label ?? data.sectorCustom ?? data.sector;
  const docTypeLabels = data.documentTypes
    .map((v) => DOCUMENT_TYPES.find((d) => d.value === v)?.label ?? v)
    .join(', ');

  const recommended = data.invoicesPerMonth > 100 ? 'Pro' : 'Starter';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Resumo</h2>
        <p className="text-muted-foreground mt-1">Verifique as suas informações antes de escolher o plano.</p>
      </div>

      <div className="space-y-3">
        <Section title="Empresa" step={1} onEdit={onGoToStep}>
          <Row label="Nome" value={data.companyName} />
          <Row label="NIF" value={data.nif} />
          <Row label="País" value={country} />
          <Row label="Setor" value={sector} />
        </Section>

        <Section title="Faturas" step={2} onEdit={onGoToStep}>
          <Row label="Volume / mês" value={`~${data.invoicesPerMonth}`} />
          <Row label="Tipos" value={docTypeLabels} />
          {data.categories.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {data.categories.slice(0, 8).map((c) => (
                <Badge key={c} variant="secondary" className="text-xs">{c}</Badge>
              ))}
              {data.categories.length > 8 && (
                <Badge variant="outline" className="text-xs">+{data.categories.length - 8}</Badge>
              )}
            </div>
          )}
        </Section>

        <Section title="Armazenamento" step={3} onEdit={onGoToStep}>
          <Row label="Fornecedor" value={data.storageProvider === 'google_drive' ? 'Google Drive' : 'OneDrive'} />
          <Row label="Sheets automático" value={data.autoSheets ? 'Sim' : 'Não'} />
        </Section>

        <Section title="Dashboard" step={4} onEdit={onGoToStep}>
          <Row label="Moeda" value={data.currency} />
          <Row label="Relatórios" value={REPORT_LABELS[data.autoReports] ?? data.autoReports} />
        </Section>

        <Section title="Automação" step={5} onEdit={onGoToStep}>
          <Row label="Sincronização de email" value={data.emailSync ? 'Ativada' : 'Desativada'} />
          {data.emailAddresses.length > 0 && (
            <Row label="Emails" value={data.emailAddresses.join(', ')} />
          )}
        </Section>
      </div>

      <div className="relative overflow-hidden rounded-xl border-2 border-primary bg-gradient-to-br from-primary/10 via-primary/5 to-accent/10 p-5">
        <div className="absolute top-0 right-0 h-24 w-24 rounded-full bg-primary/10 blur-2xl" />
        <div className="relative flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-primary">Plano recomendado</div>
            <p className="mt-1 text-lg font-bold">{recommended}</p>
            <p className="text-sm text-muted-foreground mt-1">
              Com base nas suas respostas, este é o plano ideal para si.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
