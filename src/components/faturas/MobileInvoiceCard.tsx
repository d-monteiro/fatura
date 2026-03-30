import { ChevronRight } from 'lucide-react';
import { formatEUR, formatDateFR } from '@/lib/utils/validation';
import type { Invoice } from '@/types/database';

interface MobileInvoiceCardProps {
  invoice: Invoice;
  onClick: () => void;
}

export function MobileInvoiceCard({ invoice, onClick }: MobileInvoiceCardProps) {
  const costLabel =
    invoice.cost_type === 'cout_fixe' ? 'Fixe' :
    invoice.cost_type === 'cout_variable' ? 'Variable' : null;

  return (
    <div
      onClick={onClick}
      className="cursor-pointer rounded-2xl border border-gray-200 bg-white p-4 shadow-sm
                 active:bg-gray-50 transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="truncate font-semibold text-gray-900">
              {invoice.supplier_name ?? '\u2014'}
            </span>
            {invoice.status === 'review' && (
              <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                A verifier
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span>{formatDateFR(invoice.doc_date)}</span>
            {costLabel && (
              <>
                <span>&middot;</span>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                  {costLabel}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span className="text-base font-bold text-gray-900">
            {formatEUR(invoice.montant_ttc)}
          </span>
          <ChevronRight className="h-5 w-5 text-gray-400" />
        </div>
      </div>
    </div>
  );
}
