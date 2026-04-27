import { RotateCcw, ExternalLink } from 'lucide-react';
import { formatEUR, formatDatePT } from '@/lib/utils/validation';
import { useIsMobile } from '@/hooks/useIsMobile';
import type { Invoice } from '@/types/database';

interface IgnoradasTableProps {
  invoices: Invoice[];
  onRowClick: (invoice: Invoice) => void;
  onRecover: (invoice: Invoice) => void;
  recoveringId?: string | null;
}

function humanReason(reason: string | null): string {
  if (!reason) return 'Descartada automaticamente';
  const r = reason.toLowerCase();
  if (r.startsWith('duplicada')) return reason;
  if (r.includes('não é um documento') || r.includes('nao é um documento')) return 'Não era um documento';
  if (r.includes('não é uma fatura')) return 'Não era uma fatura';
  if (r.includes('ilegível') || r.includes('ilegivel')) return 'Documento ilegível';
  if (r.includes('emitida pela própria') || r.includes('emitida pela propria')) return 'Fatura emitida pela tua empresa (não um custo)';
  return reason;
}

// Quando o Gemini rejeita o documento não temos supplier_name nem valor_total —
// caímos para os metadados do email (subject, from) capturados no sync.
function identifier(inv: Invoice): { primary: string; secondary: string | null } {
  if (inv.supplier_name) {
    return { primary: inv.supplier_name, secondary: inv.email_subject };
  }
  if (inv.email_subject || inv.email_from) {
    return {
      primary: inv.email_subject || inv.email_from || 'Sem assunto',
      secondary: inv.email_from && inv.email_subject ? inv.email_from : null,
    };
  }
  return { primary: 'Documento sem identificação', secondary: null };
}

function rowDate(inv: Invoice): string {
  return formatDatePT(inv.doc_date || (inv.email_received_at ? inv.email_received_at.slice(0, 10) : null));
}

function ViewFileButton({ inv }: { inv: Invoice }) {
  const href = inv.file_url || inv.drive_link;
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
    >
      <ExternalLink className="h-3.5 w-3.5" />
      Ver ficheiro
    </a>
  );
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
        {invoices.map((inv) => {
          const id = identifier(inv);
          return (
            <div
              key={inv.id}
              className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card"
              onClick={() => onRowClick(inv)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-gray-900">{id.primary}</p>
                  {id.secondary && (
                    <p className="truncate text-xs text-gray-500">{id.secondary}</p>
                  )}
                  <p className="mt-1 text-xs text-gray-500">
                    {rowDate(inv)}
                    {inv.valor_total != null && <> · {formatEUR(inv.valor_total)}</>}
                  </p>
                  <p className="mt-2 text-sm text-gray-600">{humanReason(inv.review_reason)}</p>
                  <div className="mt-2"><ViewFileButton inv={inv} /></div>
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
          );
        })}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-200/80 bg-white shadow-card -mx-4 sm:mx-0">
      <table className="w-full min-w-[800px] text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50/50">
            <th className="px-4 py-3 text-left font-medium text-gray-500">Data</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Origem</th>
            <th className="px-4 py-3 text-right font-medium text-gray-500">Valor</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Porque foi ignorada</th>
            <th className="px-4 py-3 text-right font-medium text-gray-500">&nbsp;</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv) => {
            const id = identifier(inv);
            return (
              <tr key={inv.id} className="border-b border-gray-50 transition-all duration-150 hover:bg-blue-50/60">
                <td className="px-4 py-3 text-gray-600 cursor-pointer" onClick={() => onRowClick(inv)}>
                  {rowDate(inv)}
                </td>
                <td className="px-4 py-3 cursor-pointer" onClick={() => onRowClick(inv)}>
                  <p className="truncate font-medium text-gray-900">{id.primary}</p>
                  {id.secondary && <p className="truncate text-xs text-gray-500">{id.secondary}</p>}
                </td>
                <td className="px-4 py-3 text-right font-medium text-gray-900 cursor-pointer" onClick={() => onRowClick(inv)}>
                  {inv.valor_total != null ? formatEUR(inv.valor_total) : '—'}
                </td>
                <td className="px-4 py-3 text-gray-600">{humanReason(inv.review_reason)}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    <ViewFileButton inv={inv} />
                    <button
                      onClick={() => onRecover(inv)}
                      disabled={recoveringId === inv.id}
                      className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      {recoveringId === inv.id ? 'A recuperar…' : 'Recuperar'}
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
