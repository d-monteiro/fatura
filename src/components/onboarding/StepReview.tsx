import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SECTORS, EU_COUNTRIES, DOCUMENT_TYPES, type OnboardingData } from './onboardingTypes';
import { Pencil } from 'lucide-react';

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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Resumo</h2>
        <p className="text-muted-foreground mt-1">Confirme antes de escolher o plano. Clique em Editar para mudar.</p>
      </div>

      <div className="space-y-3">
        <Section title="Empresa" step={1} onEdit={onGoToStep}>
          <Row label="Nome" value={data.companyName} />
          <Row label="NIF" value={data.nif} />
          <Row label="País" value={country} />
          <Row label="Setor" value={sector} />
        </Section>

        <Section title="Faturas" step={2} onEdit={onGoToStep}>
          <Row label="Variações do nome" value={data.invoiceNameVariations.join(', ')} />
          <Row label="Volume estimado / mês" value={`~${data.invoicesPerMonth}`} />
          <Row label="Tipos" value={docTypeLabels} />
        </Section>

        <Section title="Configuração" step={3} onEdit={onGoToStep}>
          <Row label="Armazenamento" value="Google Drive" />
          <Row label="Sheets automático" value={data.autoSheets ? 'Sim' : 'Não'} />
          <Row label="Moeda" value={data.currency} />
          <Row label="Relatórios" value={REPORT_LABELS[data.autoReports] ?? data.autoReports} />
          {data.autoReports !== 'never' && data.reportEmail && (
            <Row label="Email do relatório" value={data.reportEmail} />
          )}
          <Row label="Sincronização Gmail" value={data.emailSync ? 'Ativa' : 'Desativada'} />
        </Section>
      </div>
    </div>
  );
}
