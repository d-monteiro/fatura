import { Check, Pencil, X } from 'lucide-react';
import { formatEUR, formatDateFR } from '@/lib/utils/validation';
import { useI18n } from '@/contexts/I18nContext';
import type { Invoice } from '@/types/database';

interface InboxCardProps {
  invoice: Invoice;
  onApprove: (id: string) => void;
  onEdit: (id: string) => void;
  onReject: (id: string) => void;
}

export function InboxCard({ invoice, onApprove, onEdit, onReject }: InboxCardProps) {
  const { t } = useI18n();
  const confidence = invoice.confidence_score ?? 0;
  const confidenceColor =
    confidence >= 80 ? 'text-green-600 bg-green-50' :
    confidence >= 50 ? 'text-amber-600 bg-amber-50' :
    'text-red-600 bg-red-50';

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold text-gray-900">
            {invoice.supplier_name ?? 'Fournisseur inconnu'}
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            {formatDateFR(invoice.doc_date)} &middot; {invoice.doc_number ?? '—'}
          </p>
        </div>
        <p className="ml-4 text-lg font-bold text-gray-900">
          {formatEUR(invoice.montant_ttc)}
        </p>
      </div>

      {/* Confidence + suggested categories */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${confidenceColor}`}>
          {confidence}% confiance
        </span>
        {invoice.metier && (
          <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
            {invoice.metier}
          </span>
        )}
        {invoice.nature_depense && (
          <span className="rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-medium text-violet-700">
            {invoice.nature_depense}
          </span>
        )}
        {invoice.cost_type && (
          <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
            {invoice.cost_type === 'cout_fixe' ? 'Fixe' : 'Variable'}
          </span>
        )}
      </div>

      {invoice.review_reason && (
        <p className="mt-2 text-xs text-amber-600">{invoice.review_reason}</p>
      )}

      {/* Actions */}
      <div className="mt-4 flex gap-2">
        <button
          onClick={() => onApprove(invoice.id)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
        >
          <Check className="h-4 w-4" />
          {t('inbox.approve')}
        </button>
        <button
          onClick={() => onEdit(invoice.id)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <Pencil className="h-4 w-4" />
          {t('inbox.edit')}
        </button>
        <button
          onClick={() => onReject(invoice.id)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
        >
          <X className="h-4 w-4" />
          {t('inbox.reject')}
        </button>
      </div>
    </div>
  );
}
