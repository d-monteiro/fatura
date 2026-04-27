import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, ShieldOff } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useTenant } from '@/contexts/TenantContext';
import { useCompanyFilter } from '@/hooks/useCompanyFilter';
import { queryKeys, invalidateInvoiceLists } from '@/lib/queryKeys';
import { DuplicatePairCard } from '@/components/faturas/DuplicatePairCard';
import { InvoiceDetailDrawer } from '@/components/faturas/InvoiceDetailDrawer';
import type { Invoice, PotentialDuplicateRow } from '@/types/database';

export default function Duplicates() {
  const { tenant } = useTenant();
  const { companyId } = useCompanyFilter();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [inspecting, setInspecting] = useState<Invoice | null>(null);

  const tenantId = tenant?.id ?? null;

  const { data: pairs = [], isLoading } = useQuery({
    queryKey: queryKeys.duplicates(tenantId, companyId),
    enabled: !!tenantId,
    queryFn: async (): Promise<PotentialDuplicateRow[]> => {
      const { data, error } = await supabase.rpc('find_potential_duplicates', {
        p_tenant_id: tenantId!,
        p_company_id: companyId,
      });
      if (error) throw error;
      return (data ?? []) as PotentialDuplicateRow[];
    },
  });

  const invoiceIds = useMemo(() => {
    const s = new Set<string>();
    pairs.forEach((p) => { s.add(p.invoice_a_id); s.add(p.invoice_b_id); });
    return [...s];
  }, [pairs]);

  const { data: invoices = [] } = useQuery({
    queryKey: ['duplicates', 'invoices', tenantId, invoiceIds],
    enabled: !!tenantId && invoiceIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from('invoices')
        .select('*').in('id', invoiceIds).eq('tenant_id', tenantId!);
      if (error) throw error;
      return (data ?? []) as Invoice[];
    },
  });

  const invoiceMap = useMemo(() => {
    const m = new Map<string, Invoice>();
    invoices.forEach((inv) => m.set(inv.id, inv));
    return m;
  }, [invoices]);

  const dismissMutation = useMutation({
    mutationFn: async (pair: PotentialDuplicateRow) => {
      const { error } = await supabase.from('dismissed_duplicates').insert({
        tenant_id: tenantId!,
        invoice_a_id: pair.invoice_a_id,
        invoice_b_id: pair.invoice_b_id,
        dismissed_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Par marcado como "manter ambos".');
      qc.invalidateQueries({ queryKey: ['duplicates'] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Erro a descartar par'),
  });

  const markDuplicateMutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      const { error } = await supabase.from('invoices')
        .update({ deleted_at: new Date().toISOString(), status: 'inbox' })
        .eq('id', invoiceId).eq('tenant_id', tenantId!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Fatura movida para Ignoradas.');
      invalidateInvoiceLists(qc);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Erro a marcar duplicado'),
  });

  const renderablePairs = pairs.filter(
    (p) => invoiceMap.has(p.invoice_a_id) && invoiceMap.has(p.invoice_b_id),
  );

  return (
    <div className="animate-fade-in space-y-4 sm:space-y-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/invoices')}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar
        </button>
        <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Possíveis duplicados</h1>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-2xl bg-gray-100" />
          ))}
        </div>
      ) : renderablePairs.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white p-12 text-center shadow-card">
          <ShieldOff className="mb-3 h-10 w-10 text-gray-400" />
          <p className="text-base font-medium text-gray-900">Nenhum duplicado pendente.</p>
          <p className="mt-1 max-w-md text-sm text-gray-500">
            Detectamos duplicados por nº de documento ou por combinação fornecedor+data+valor.
            Faturas marcadas como "manter ambos" não voltam a aparecer aqui.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {renderablePairs.map((pair) => (
            <DuplicatePairCard
              key={`${pair.invoice_a_id}-${pair.invoice_b_id}`}
              pair={pair}
              invoiceA={invoiceMap.get(pair.invoice_a_id)!}
              invoiceB={invoiceMap.get(pair.invoice_b_id)!}
              onDismiss={() => dismissMutation.mutate(pair)}
              onMarkDuplicate={(id) => markDuplicateMutation.mutate(id)}
              onInspect={setInspecting}
              disabled={dismissMutation.isPending || markDuplicateMutation.isPending}
            />
          ))}
        </div>
      )}

      <InvoiceDetailDrawer
        invoice={inspecting}
        open={!!inspecting}
        onClose={() => setInspecting(null)}
      />
    </div>
  );
}
