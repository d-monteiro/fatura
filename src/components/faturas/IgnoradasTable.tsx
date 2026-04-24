import { RotateCcw } from 'lucide-react';
import { formatEUR, formatDatePT } from '@/lib/utils/validation';
import { useIsMobile } from '@/hooks/useIsMobile';
import type { Invoice } from '@/types/database';

interface IgnoradasTableProps {
  invoices: Invoice[];
  onRowClick: (invoice: Invoice) => void;
  onRecover: (invoice: Invoice) => void;
  recoveringId?: string | null;
}

// Humaniza review_reason para o utilizador. Mantém fallback com o texto cru
// para casos que não reconhecemos.
function humanReason(reason: string | null): string {
  if (!reason) return 'Descartada automaticamente';
  const r = reason.toLowerCase();
  if (r.startsWith('duplicada')) return reason; // já em PT: "Duplicada de …"
  if (r.includes('não é um documento') || r.includes('nao é um documento')) return 'Não era um documento';
  if (r.includes('não é uma fatura')) return 'Não era uma fatura';
  if (r.includes('ilegível') || r.includes('ilegivel')) return 'Documento ilegível';
  if (r.includes('emitida pela própria') || r.includes('emitida pela propria')) return 'Fatura emitida pela tua empresa (não um custo)';
  return reason;
}

export function IgnoradasTable({ invoices, onRowClick, onRecover, recoveringId }: IgnoradasTableProps) {
  const isMobile = useIsMobile();

  if (invoices.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-gray-400">
        Nada foi ignorado nos últimos dias.
      </div>
    );
  }

  if (isMobile) {
    return (
      <div className="space-y-3">
        {invoices.map((inv) => (
          <div
            key={inv.id}
            className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card"
            onClick={() => onRowClick(inv)}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-gray-900">{inv.supplier_name ?? '—'}</p>
                <p className="text-xs text-gray-500">{formatDatePT(inv.doc_date)} · {formatEUR(inv.montant_ttc)}</p>
                <p className="mt-2 text-sm text-gray-600">{humanReason(inv.review_reason)}</p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); onRecover(inv); }}
                disabled={recoveringId === inv.id}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Recuperar
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-200/80 bg-white shadow-card -mx-4 sm:mx-0">
      <table className="w-full min-w-[700px] text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50/50">
            <th className="px-4 py-3 text-left font-medium text-gray-500">Data</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Fornecedor</th>
            <th className="px-4 py-3 text-right font-medium text-gray-500">Valor</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Porque foi ignorada</th>
            <th className="px-4 py-3 text-right font-medium text-gray-500">&nbsp;</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv) => (
            <tr key={inv.id} className="border-b border-gray-50 transition-all duration-150 hover:bg-blue-50/60">
              <td className="px-4 py-3 text-gray-600 cursor-pointer" onClick={() => onRowClick(inv)}>
                {formatDatePT(inv.doc_date)}
              </td>
              <td className="px-4 py-3 font-medium text-gray-900 cursor-pointer" onClick={() => onRowClick(inv)}>
                {inv.supplier_name ?? '—'}
              </td>
              <td className="px-4 py-3 text-right font-medium text-gray-900 cursor-pointer" onClick={() => onRowClick(inv)}>
                {formatEUR(inv.montant_ttc)}
              </td>
              <td className="px-4 py-3 text-gray-600">{humanReason(inv.review_reason)}</td>
              <td className="px-4 py-3 text-right">
                <button
                  onClick={() => onRecover(inv)}
                  disabled={recoveringId === inv.id}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {recoveringId === inv.id ? 'A recuperar…' : 'Recuperar'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
