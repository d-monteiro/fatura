import { Clock, AlertTriangle, Percent, FileWarning, RefreshCw, Hourglass, Ban } from 'lucide-react';
import type { Invoice } from '@/types/database';
import { humanizeReviewReason, parseReviewReason } from '@/lib/reviewReason';

const KIND_VISUAL = {
  iva_inconsistente: { Icon: Percent, label: 'IVA suspeito' },
  parse_error: { Icon: FileWarning, label: 'Erro de leitura' },
  timeout: { Icon: Hourglass, label: 'Tempo esgotado' },
  document_type_unknown: { Icon: FileWarning, label: 'Tipo desconhecido' },
  internal_error: { Icon: AlertTriangle, label: 'Erro interno' },
  low_confidence: { Icon: AlertTriangle, label: 'Verificação manual' },
  manual_request: { Icon: RefreshCw, label: 'Em revisão' },
  sync_cancelled: { Icon: Ban, label: 'Sync cancelado' },
} as const;

export function StatusBadge({ invoice }: { invoice: Invoice }) {
  if (invoice.status === 'analyzing' || invoice.status === 'discovered'
      || invoice.status === 'fetching' || invoice.status === 'extracted') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
        <Clock className="h-3 w-3 animate-pulse" />
        A processar
      </span>
    );
  }
  if (invoice.status === 'cancelled') {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600"
        title={humanizeReviewReason(invoice.review_reason)}
      >
        <Ban className="h-3 w-3" />
        Cancelado
      </span>
    );
  }
  if (invoice.status === 'failed_permanent') {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700"
        title={invoice.review_reason ?? 'Limite de tentativas excedido'}
      >
        <AlertTriangle className="h-3 w-3" />
        Falha permanente
      </span>
    );
  }
  if (invoice.status === 'review' || invoice.status === 'failed') {
    const { kind } = parseReviewReason(invoice.review_reason);
    const visual = (kind && KIND_VISUAL[kind]) ?? {
      Icon: AlertTriangle,
      label: invoice.status === 'failed' ? 'Erro' : 'Verificação manual',
    };
    const isError = invoice.status === 'failed';
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
          isError ? 'bg-red-50 text-red-700' : 'bg-amber-100 text-amber-800'
        }`}
        title={humanizeReviewReason(invoice.review_reason)}
      >
        <visual.Icon className="h-3 w-3" />
        {visual.label}
      </span>
    );
  }
  return null;
}
