import { RotateCcw, ExternalLink } from 'lucide-react';
import { formatEUR } from '@/lib/utils/validation';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useRole } from '@/hooks/useRole';
import { invoiceIdentifier, invoiceDisplayDate, humanIgnoredReason } from './invoiceDisplay';
import type { Invoice } from '@/types/database';

interface IgnoradasTableProps {
  invoices: Invoice[];
  onRowClick: (invoice: Invoice) => void;
  onRecover: (invoice: Invoice) => void;
  isRecovering: (id: string) => boolean;
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

export function IgnoradasTable({ invoices, onRowClick, onRecover, isRecovering }: IgnoradasTableProps) {
  const isMobile = useIsMobile();
  const { can } = useRole();
  const canRecover = can('recover_invoice');

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
          const id = invoiceIdentifier(inv);
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
                    {invoiceDisplayDate(inv)}
                    {inv.valor_total != null && <> · {formatEUR(inv.valor_total)}</>}
                  </p>
                  <p className="mt-2 text-sm text-gray-600">{humanIgnoredReason(inv.review_reason)}</p>
                  <div className="mt-2"><ViewFileButton inv={inv} /></div>
                </div>
                {canRecover && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onRecover(inv); }}
                    disabled={isRecovering(inv.id)}
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    {isRecovering(inv.id) ? 'A recuperar…' : 'Recuperar'}
                  </button>
                )}
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
            const id = invoiceIdentifier(inv);
            return (
              <tr key={inv.id} className="border-b border-gray-50 transition-all duration-150 hover:bg-blue-50/60">
                <td className="px-4 py-3 text-gray-600 cursor-pointer" onClick={() => onRowClick(inv)}>
                  {invoiceDisplayDate(inv)}
                </td>
                <td className="px-4 py-3 cursor-pointer" onClick={() => onRowClick(inv)}>
                  <p className="truncate font-medium text-gray-900">{id.primary}</p>
                  {id.secondary && <p className="truncate text-xs text-gray-500">{id.secondary}</p>}
                </td>
                <td className="px-4 py-3 text-right font-medium text-gray-900 cursor-pointer" onClick={() => onRowClick(inv)}>
                  {inv.valor_total != null ? formatEUR(inv.valor_total) : '—'}
                </td>
                <td className="px-4 py-3 text-gray-600">{humanIgnoredReason(inv.review_reason)}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    <ViewFileButton inv={inv} />
                    {canRecover && (
                      <button
                        onClick={() => onRecover(inv)}
                        disabled={isRecovering(inv.id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        {isRecovering(inv.id) ? 'A recuperar…' : 'Recuperar'}
                      </button>
                    )}
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
