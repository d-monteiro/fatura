import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SECTORS, EU_COUNTRIES, FOLDER_TEMPLATES, type OnboardingData } from './onboardingTypes';
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
          <Pencil className="h-3 w-3" /> Modifier
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

export function StepReview({ data, onGoToStep }: Props) {
  const country = EU_COUNTRIES.find((c) => c.value === data.country)?.label ?? data.country;
  const sector = SECTORS.find((s) => s.value === data.sector)?.label ?? data.sectorCustom ?? data.sector;
  const folder = FOLDER_TEMPLATES.find((f) => f.value === data.folderStructure)?.label ?? data.folderStructure;

  const recommended = data.invoicesPerMonth > 100 ? 'Pro' : 'Starter';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Résumé</h2>
        <p className="text-muted-foreground mt-1">Vérifiez vos informations avant de choisir votre plan.</p>
      </div>

      <div className="space-y-3">
        <Section title="Entreprise" step={1} onEdit={onGoToStep}>
          <Row label="Nom" value={data.companyName} />
          <Row label="NIF" value={data.nif} />
          <Row label="Pays" value={country} />
          <Row label="Secteur" value={sector} />
        </Section>

        <Section title="Factures" step={2} onEdit={onGoToStep}>
          <Row label="Volume / mois" value={`~${data.invoicesPerMonth}`} />
          <Row label="Types" value={data.documentTypes.join(', ')} />
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

        <Section title="Stockage" step={3} onEdit={onGoToStep}>
          <Row label="Provider" value={data.storageProvider === 'google_drive' ? 'Google Drive' : 'OneDrive'} />
          <Row label="Structure" value={folder} />
          <Row label="Sheets auto" value={data.autoSheets ? 'Oui' : 'Non'} />
        </Section>

        <Section title="Dashboard" step={4} onEdit={onGoToStep}>
          <Row label="Devise" value={data.currency} />
          <Row label="Rapports" value={data.autoReports === 'never' ? 'Désactivés' : data.autoReports} />
        </Section>

        <Section title="Automatisation" step={5} onEdit={onGoToStep}>
          <Row label="Email sync" value={data.emailSync ? 'Activé' : 'Désactivé'} />
          {data.emailAddresses.length > 0 && (
            <Row label="Emails" value={data.emailAddresses.join(', ')} />
          )}
        </Section>
      </div>

      <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 text-sm">
        Basé sur vos réponses, nous recommandons le plan <strong>{recommended}</strong>.
      </div>
    </div>
  );
}
