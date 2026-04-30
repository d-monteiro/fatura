import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users2, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { queryKeys } from '@/lib/queryKeys';
import { formatNifMaskPT } from '@/lib/utils/nif';

interface DuplicatePair {
  supplier_a_id: string;
  supplier_b_id: string;
  match_kind: 'nif' | 'name';
  similarity: number;
  name_a: string;
  name_b: string;
  nif_a: string | null;
  nif_b: string | null;
  invoice_count_a: number;
  invoice_count_b: number;
}

const KIND_LABEL: Record<DuplicatePair['match_kind'], string> = {
  nif: 'Mesmo NIF',
  name: 'Nome semelhante',
};

export function DuplicateSuppliersCard() {
  const { tenant } = useTenant();
  const tenantId = tenant?.id ?? null;
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);

  const { data: pairs, isLoading } = useQuery({
    queryKey: ['duplicate-suppliers', tenantId],
    enabled: !!tenantId && expanded,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('find_duplicate_suppliers', { p_tenant_id: tenantId });
      if (error) throw error;
      return (data ?? []) as DuplicatePair[];
    },
  });

  const merge = useMutation({
    mutationFn: async (input: { primary: string; secondary: string }) => {
      const { data, error } = await supabase.rpc('merge_suppliers', {
        p_primary_id: input.primary,
        p_secondary_id: input.secondary,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['duplicate-suppliers', tenantId] });
      qc.invalidateQueries({ queryKey: queryKeys.suppliers });
      qc.invalidateQueries({ queryKey: queryKeys.suppliersList(tenantId) });
      toast.success('Fornecedores fundidos.');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!tenant) return null;

  const totalPairs = pairs?.length ?? 0;

  return (
    <div className="border border-border rounded-xl p-6">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-start justify-between gap-3 text-left"
      >
        <div className="flex items-start gap-2">
          <Users2 size={20} className="mt-0.5 text-muted-foreground" />
          <div>
            <h2 className="text-lg font-semibold leading-tight">Fornecedores duplicados</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Detecta e funde fornecedores com o mesmo NIF ou nome muito semelhante.
            </p>
          </div>
        </div>
        <ChevronRight className={`mt-1 h-5 w-5 text-gray-400 transition ${expanded ? 'rotate-90' : ''}`} />
      </button>

      {expanded && (
        <div className="mt-4 space-y-2">
          {isLoading && <p className="text-sm text-muted-foreground">A procurar…</p>}
          {!isLoading && totalPairs === 0 && (
            <p className="text-sm text-muted-foreground italic">Nenhum par encontrado.</p>
          )}
          {pairs?.map((p) => (
            <DuplicatePairRow
              key={`${p.supplier_a_id}-${p.supplier_b_id}`}
              pair={p}
              onMerge={(primary, secondary) => merge.mutate({ primary, secondary })}
              loading={merge.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DuplicatePairRow({
  pair,
  onMerge,
  loading,
}: {
  pair: DuplicatePair;
  onMerge: (primary: string, secondary: string) => void;
  loading: boolean;
}) {
  // Decisão de qual fica primary: o que tem mais faturas. Empate → o A.
  const primaryFirst = pair.invoice_count_a >= pair.invoice_count_b;
  const [primary, setPrimary] = useState<'a' | 'b'>(primaryFirst ? 'a' : 'b');

  const primaryId = primary === 'a' ? pair.supplier_a_id : pair.supplier_b_id;
  const secondaryId = primary === 'a' ? pair.supplier_b_id : pair.supplier_a_id;

  return (
    <div className="rounded-lg border border-border p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
          {KIND_LABEL[pair.match_kind]}
          {pair.match_kind === 'name' && ` (${(pair.similarity * 100).toFixed(0)}%)`}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {(['a', 'b'] as const).map((side) => {
          const isSelected = primary === side;
          const name = side === 'a' ? pair.name_a : pair.name_b;
          const nif = side === 'a' ? pair.nif_a : pair.nif_b;
          const invoiceCount = side === 'a' ? pair.invoice_count_a : pair.invoice_count_b;
          return (
            <button
              key={side}
              type="button"
              onClick={() => setPrimary(side)}
              className={`flex flex-col items-start gap-0.5 rounded-md border px-3 py-2 text-left transition ${
                isSelected
                  ? 'border-primary bg-primary/5'
                  : 'border-input bg-white hover:bg-gray-50'
              }`}
            >
              <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
                {isSelected ? 'Manter' : 'Fundir → primary'}
              </span>
              <span className="text-sm font-semibold text-gray-900 truncate w-full">{name}</span>
              <span className="text-xs text-gray-500 font-mono">{formatNifMaskPT(nif) || '—'}</span>
              <span className="text-xs text-gray-500">{invoiceCount} fatura(s)</span>
            </button>
          );
        })}
      </div>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => onMerge(primaryId, secondaryId)}
          disabled={loading}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {loading ? 'A fundir…' : 'Fundir'}
        </button>
      </div>
    </div>
  );
}
