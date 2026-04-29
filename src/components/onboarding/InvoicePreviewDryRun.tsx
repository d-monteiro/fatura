import { useCallback, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle2, AlertTriangle, FileSearch, Loader2, Upload, X } from 'lucide-react';
import type { OnboardingData } from './onboardingTypes';
import { CATEGORY_TEMPLATES } from './onboardingTypes';
import { track } from '@/lib/analytics/track';
import { EVENTS } from '@/lib/analytics/events';

const ACCEPTED = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf', 'image/heic', 'image/heif'];
const MAX_SIZE = 6 * 1024 * 1024;

interface ExtractedInvoice {
  is_valid_document?: boolean;
  rejection_reason?: string | null;
  document_type?: string | null;
  category?: string | null;
  doc_date?: string | null;
  data_vencimento?: string | null;
  supplier_name?: string | null;
  supplier_nif?: string | null;
  doc_number?: string | null;
  valor_sem_iva?: number | null;
  taxa_iva?: number | null;
  valor_iva?: number | null;
  valor_total?: number | null;
  summary?: string | null;
  confidence_score?: number | null;
}

interface Props {
  data: OnboardingData;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.substring(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function buildPreviewConfig(data: OnboardingData) {
  const sectorKey = data.sector === 'outro' ? 'services' : data.sector;
  const template = CATEGORY_TEMPLATES[sectorKey] ?? CATEGORY_TEMPLATES.services ?? [];
  return {
    companyName: data.companyName,
    nif: data.nif,
    sector: data.sector === 'outro' ? data.sectorCustom : data.sector,
    country: data.country,
    currency: data.currency,
    nameVariations: data.invoiceNameVariations,
    categories: template.map((c) => c.label),
    documentTypes: data.documentTypes,
  };
}

function fmtMoney(value: number | null | undefined): string {
  if (value == null) return '—';
  return new Intl.NumberFormat('pt-PT', { minimumFractionDigits: 2 }).format(value);
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export function InvoicePreviewDryRun({ data }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<ExtractedInvoice[] | null>(null);

  const handleFile = useCallback((files: FileList | null) => {
    setError(null);
    setExtracted(null);
    const f = files?.[0];
    if (!f) return;
    if (!ACCEPTED.includes(f.type)) {
      setError('Formato não suportado. Use PDF, JPG ou PNG.');
      return;
    }
    if (f.size > MAX_SIZE) {
      setError('Ficheiro demasiado grande (máx 6 MB).');
      return;
    }
    setFile(f);
  }, []);

  const handleRun = useCallback(async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setExtracted(null);
    const startedAt = Date.now();
    try {
      const base64 = await fileToBase64(file);
      const { data: result, error: invokeErr } = await supabase.functions.invoke('analyze-document-preview', {
        body: {
          data: base64,
          mimeType: file.type,
          config: buildPreviewConfig(data),
        },
      });
      if (invokeErr) throw new Error(invokeErr.message);
      const invoices = (result as { invoices?: ExtractedInvoice[] } | null)?.invoices ?? [];
      setExtracted(invoices);
      track(EVENTS.ONBOARDING_DRY_RUN_RAN, {
        outcome: 'success',
        invoices_count: invoices.length,
        valid_count: invoices.filter((i) => i.is_valid_document !== false).length,
        duration_ms: Date.now() - startedAt,
        file_size_bytes: file.size,
        mime_type: file.type,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Falha no preview.';
      setError(msg);
      track(EVENTS.ONBOARDING_DRY_RUN_RAN, {
        outcome: 'failure',
        error: msg,
        duration_ms: Date.now() - startedAt,
        file_size_bytes: file.size,
        mime_type: file.type,
      });
    } finally {
      setLoading(false);
    }
  }, [file, data]);

  return (
    <Card className="border-dashed">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
            <FileSearch className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold">Testar a extração antes de pagar</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Carregue uma fatura real e veja como a IA a vai ler com a configuração actual.
              Pode voltar atrás para ajustar variações de nome ou categorias.
            </p>
          </div>
        </div>

        {!file && (
          <label className="flex items-center justify-center gap-2 rounded-lg border-2 border-dashed p-5 cursor-pointer hover:bg-muted/40 transition-colors">
            <Upload className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Selecionar fatura (PDF, JPG, PNG)</span>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.heic,.heif"
              className="hidden"
              onChange={(e) => handleFile(e.target.files)}
            />
          </label>
        )}

        {file && !extracted && !loading && (
          <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2">
            <span className="text-xs truncate">{file.name}</span>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => setFile(null)} className="h-7 w-7 p-0" aria-label="Remover">
                <X className="h-3 w-3" />
              </Button>
              <Button size="sm" onClick={handleRun} className="gap-1.5">
                <FileSearch className="h-3 w-3" /> Testar
              </Button>
            </div>
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-2 rounded-lg bg-muted/30 px-3 py-3 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            A analisar a fatura com a IA...
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {extracted && extracted.length === 0 && (
          <div className="rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            A IA não conseguiu extrair nada. Tente outra fatura ou volte ao passo 2 para ajustar.
          </div>
        )}

        {extracted && extracted.length > 0 && (
          <div className="space-y-3">
            {extracted.map((inv, idx) => (
              <ExtractedCard key={idx} invoice={inv} />
            ))}
            <Button size="sm" variant="outline" onClick={() => { setFile(null); setExtracted(null); }} className="w-full">
              Testar outra fatura
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ExtractedCard({ invoice }: { invoice: ExtractedInvoice }) {
  const valid = invoice.is_valid_document !== false;
  const confidence = typeof invoice.confidence_score === 'number' ? invoice.confidence_score : null;
  const lowConfidence = confidence != null && confidence < 0.8;

  if (!valid) {
    return (
      <div className="rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2.5 text-xs text-amber-900 space-y-1">
        <div className="flex items-center gap-1.5 font-semibold">
          <AlertTriangle className="h-3.5 w-3.5" />
          Documento rejeitado
        </div>
        <div>Motivo: {invoice.rejection_reason ?? 'desconhecido'}.</div>
        <div className="text-amber-800/80">
          Em produção, esta fatura ficaria fora do dashboard. Se devia ser aceite, ajuste o passo 1 (setor) ou o passo 2 (variações de nome).
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border px-3 py-3 text-xs space-y-2 ${lowConfidence ? 'border-amber-300/70 bg-amber-50/40' : 'border-emerald-300/70 bg-emerald-50/40'}`}>
      <div className="flex items-center justify-between">
        <span className={`flex items-center gap-1.5 font-semibold ${lowConfidence ? 'text-amber-900' : 'text-emerald-900'}`}>
          {lowConfidence ? <AlertTriangle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
          {lowConfidence ? 'Extração com baixa confiança' : 'Fatura extraída'}
        </span>
        {confidence != null && (
          <span className="text-[11px] text-muted-foreground">
            confiança: {Math.round(confidence * 100)}%
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        <Field label="Fornecedor" value={invoice.supplier_name} />
        <Field label="NIF" value={invoice.supplier_nif} />
        <Field label="Nº Documento" value={invoice.doc_number} />
        <Field label="Data" value={fmtDate(invoice.doc_date)} />
        <Field label="Vencimento" value={fmtDate(invoice.data_vencimento)} />
        <Field label="Categoria" value={invoice.category} />
        <Field label="Sem IVA" value={fmtMoney(invoice.valor_sem_iva)} />
        <Field label="IVA" value={`${fmtMoney(invoice.valor_iva)}${invoice.taxa_iva != null ? ` (${invoice.taxa_iva}%)` : ''}`} />
        <Field label="Total" value={fmtMoney(invoice.valor_total)} accent />
      </div>

      {invoice.summary && (
        <div className="text-[11px] text-muted-foreground border-t pt-2">
          <span className="font-medium">Resumo: </span>{invoice.summary}
        </div>
      )}

      {lowConfidence && (
        <div className="text-[11px] text-amber-800 border-t border-amber-200 pt-1.5">
          A IA tem dúvidas. Em produção, esta fatura iria para "Revisão Manual" para confirmação.
        </div>
      )}
    </div>
  );
}

function Field({ label, value, accent }: { label: string; value: string | null | undefined; accent?: boolean }) {
  return (
    <div className="flex justify-between gap-2 min-w-0">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={`text-right truncate ${accent ? 'font-bold' : 'font-medium'}`}>{value || '—'}</span>
    </div>
  );
}
