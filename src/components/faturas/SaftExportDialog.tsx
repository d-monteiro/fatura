import { useState } from 'react';
import { toast } from 'sonner';
import { FileArchive, Download, Lock } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { useCompanyFilter } from '@/hooks/useCompanyFilter';
import { useFeatureGate } from '@/hooks/useFeatureGate';

interface Props { open: boolean; onOpenChange: (open: boolean) => void }

function firstDayOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function lastDayOfMonth(): string {
  const d = new Date(); const y = d.getFullYear(); const m = d.getMonth() + 1;
  const last = new Date(y, m, 0).getDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
}

export function SaftExportDialog({ open, onOpenChange }: Props) {
  const { tenant } = useTenant();
  const { companies, companyId: urlCompanyId } = useCompanyFilter();
  const eligibleCompanies = companies.filter((c) => c.nif && /^\d{9}$/.test(c.nif));
  const saftGate = useFeatureGate('saft_export');

  const [companyId, setCompanyId] = useState<string>(urlCompanyId ?? eligibleCompanies[0]?.id ?? '');
  const [periodStart, setPeriodStart] = useState(firstDayOfMonth());
  const [periodEnd, setPeriodEnd] = useState(lastDayOfMonth());
  const [loading, setLoading] = useState(false);

  const planAllowed = saftGate.allowed;

  async function onGenerate() {
    if (!tenant?.id) return;
    if (!companyId) {
      toast.error('Selecciona uma empresa.');
      return;
    }
    if (periodEnd < periodStart) {
      toast.error('A data final tem de ser posterior à inicial.');
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('export-saft', {
        body: {
          tenant_id: tenant.id,
          company_id: companyId,
          period_start: periodStart,
          period_end: periodEnd,
        },
      });
      if (error) throw new Error(error.message);
      const payload = data as { url?: string; filename?: string; invoices_count?: number; pdfs_included?: number; error?: string };
      if (!payload.url) throw new Error(payload.error ?? 'Falha a gerar SAF-T.');

      // Trigger download — o browser descarrega do Storage signed URL.
      const a = document.createElement('a');
      a.href = payload.url;
      a.download = payload.filename ?? 'saft.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();

      toast.success(`SAF-T gerado: ${payload.invoices_count} faturas · ${payload.pdfs_included} PDFs.`);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro a gerar SAF-T.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileArchive className="h-5 w-5 text-primary" />
            Exportar SAF-T para contabilista
          </DialogTitle>
          <DialogDescription>
            Gera um ZIP com o ficheiro SAF-T (PT), PDFs originais e um resumo Excel.
            O NIF do SAF-T é o da empresa seleccionada.
          </DialogDescription>
        </DialogHeader>

        {!planAllowed ? (
          <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <Lock className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">{saftGate.message ?? 'Disponível nos planos Pro e Empresarial.'}</p>
              <p className="mt-1 text-xs">Faz upgrade em Faturação para activar.</p>
            </div>
          </div>
        ) : eligibleCompanies.length === 0 ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
            Nenhuma empresa tem NIF válido (9 dígitos). Preenche em Definições → Empresas antes de exportar.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="saft-company">Empresa</Label>
              <Select value={companyId} onValueChange={setCompanyId}>
                <SelectTrigger id="saft-company"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {eligibleCompanies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} · {c.nif}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {companies.length > eligibleCompanies.length && (
                <p className="text-xs text-gray-500">
                  {companies.length - eligibleCompanies.length} empresa(s) omitida(s) por falta de NIF válido.
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="saft-start">Data inicial</Label>
                <Input id="saft-start" type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="saft-end">Data final</Label>
                <Input id="saft-end" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Fechar
          </button>
          <button
            type="button"
            onClick={onGenerate}
            disabled={loading || !planAllowed || eligibleCompanies.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-90 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            {loading ? 'A gerar…' : 'Gerar e descarregar'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
