import { ChevronRight } from 'lucide-react';
import { formatEUR, formatDatePT } from '@/lib/utils/validation';
import { useTenant } from '@/contexts/TenantContext';
import { useCategories } from '@/hooks/useCategories';
import { StatusBadge } from './StatusBadge';
import type { Invoice } from '@/types/database';

interface MobileInvoiceCardProps {
  invoice: Invoice;
  onClick: () => void;
}

export function MobileInvoiceCard({ invoice, onClick }: MobileInvoiceCardProps) {
  const { tenant } = useTenant();
  const { labelFor } = useCategories(tenant?.id);
  const categoryLabel = labelFor(invoice.category) || null;

  return (
    <div
      onClick={onClick}
      className="cursor-pointer rounded-2xl border border-gray-200/80 bg-white p-4 shadow-card
                 active:bg-gray-50 transition-all duration-150 hover:shadow-card-hover"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="truncate font-semibold text-gray-900">
              {invoice.supplier_name ?? '—'}
            </span>
            <StatusBadge invoice={invoice} />
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span>{formatDatePT(invoice.doc_date)}</span>
            {categoryLabel && (
              <>
                <span>·</span>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                  {categoryLabel}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span className="text-base font-bold text-gray-900">
            {formatEUR(invoice.valor_total)}
          </span>
          <ChevronRight className="h-5 w-5 text-gray-400" />
        </div>
      </div>
    </div>
  );
}
