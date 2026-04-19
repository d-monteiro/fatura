import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import type { OnboardingSubmission } from '@/types/tenant';
import {
  sectorLabel, countryLabel, documentTypeLabel, folderStructureLabel, currencyLabel,
  AUTO_REPORTS_LABEL, STORAGE_PROVIDER_LABEL, BILLING_CYCLE_LABEL,
} from '@/lib/admin/labels';

interface Props { submission: OnboardingSubmission | null; onClose: () => void; }

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  draft: 'outline', submitted: 'default', processing: 'secondary', completed: 'secondary', failed: 'destructive',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm break-words">{children ?? '—'}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border p-3 space-y-3">
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{title}</div>
      {children}
    </section>
  );
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}
function num(v: unknown): number | null {
  return typeof v === 'number' ? v : null;
}
function bool(v: unknown): boolean {
  return v === true;
}
function arr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

export function OnboardingDetailDrawer({ submission, onClose }: Props) {
  if (!submission) return null;

  const company = (submission.block_company ?? {}) as Record<string, unknown>;
  const intel = (submission.block_invoice_intel ?? {}) as Record<string, unknown>;
  const storage = (submission.block_storage ?? {}) as Record<string, unknown>;
  const dashboard = (submission.block_dashboard ?? {}) as Record<string, unknown>;
  const automation = (submission.block_automation ?? {}) as Record<string, unknown>;

  const sectorVal = str(company.sector);
  const docs = arr(intel.documentTypes);
  const emails = arr(automation.emailAddresses);
  const variations = arr(intel.invoiceNameVariations);

  return (
    <Sheet open={!!submission} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="break-words pr-8">{submission.email}</SheetTitle>
          <div className="flex items-center gap-2 pt-1 flex-wrap">
            <Badge variant={STATUS_VARIANT[submission.status] ?? 'outline'}>{submission.status}</Badge>
            <span className="text-xs text-muted-foreground">
              Passo {submission.current_step}/7 · {new Date(submission.created_at).toLocaleString('pt-PT')}
            </span>
          </div>
        </SheetHeader>

        <div className="space-y-4 mt-6">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Field label="Plano">{submission.selected_plan}</Field>
            <Field label="Ciclo">{BILLING_CYCLE_LABEL[submission.billing_cycle] ?? submission.billing_cycle}</Field>
            <Field label="Pagamento">{submission.payment_completed ? 'Completo' : 'Pendente'}</Field>
            <Field label="Amostras">{submission.sample_invoices?.length ?? 0} ficheiro(s)</Field>
          </div>

          {submission.provisioning_error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs">
              <div className="font-medium text-destructive mb-1">Erro de provisionamento</div>
              <div className="text-muted-foreground break-words">{submission.provisioning_error}</div>
            </div>
          )}

          {Object.keys(company).length > 0 && (
            <Section title="Empresa">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nome">{str(company.companyName)}</Field>
                <Field label="NIF">{str(company.nif)}</Field>
                <Field label="País">{countryLabel(str(company.country))}</Field>
                <Field label="Setor">{sectorVal === 'outro' ? str(company.sectorCustom) : sectorLabel(sectorVal)}</Field>
                <Field label="Cor primária">{str(company.primaryColor)}</Field>
                <Field label="Cor secundária">{str(company.secondaryColor)}</Field>
              </div>
            </Section>
          )}

          {Object.keys(intel).length > 0 && (
            <Section title="Faturação">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Faturas/mês">{num(intel.invoicesPerMonth)}</Field>
                <Field label="Tipos de documento">
                  {docs.length > 0 ? docs.map(documentTypeLabel).join(', ') : null}
                </Field>
              </div>
              {variations.length > 0 && (
                <Field label="Variações de nome">
                  <div className="flex flex-wrap gap-1 mt-1">
                    {variations.map((v) => <Badge key={v} variant="outline">{v}</Badge>)}
                  </div>
                </Field>
              )}
            </Section>
          )}

          {Object.keys(storage).length > 0 && (
            <Section title="Armazenamento">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Provider">{STORAGE_PROVIDER_LABEL[str(storage.storageProvider) ?? ''] ?? str(storage.storageProvider)}</Field>
                <Field label="Estrutura de pastas">{folderStructureLabel(str(storage.folderStructure))}</Field>
                <Field label="Google Sheets auto">{bool(storage.autoSheets) ? 'Sim' : 'Não'}</Field>
              </div>
            </Section>
          )}

          {Object.keys(dashboard).length > 0 && (
            <Section title="Dashboard">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Moeda">{currencyLabel(str(dashboard.currency))}</Field>
                <Field label="Relatórios auto">{AUTO_REPORTS_LABEL[str(dashboard.autoReports) ?? ''] ?? '—'}</Field>
              </div>
            </Section>
          )}

          {Object.keys(automation).length > 0 && (
            <Section title="Automações">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Sync email">{bool(automation.emailSync) ? 'Ativo' : 'Não'}</Field>
                <Field label="Contas email">{emails.length}</Field>
              </div>
              {emails.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {emails.map((e) => <Badge key={e} variant="outline">{e}</Badge>)}
                </div>
              )}
            </Section>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
