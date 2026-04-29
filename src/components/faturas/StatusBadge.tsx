import { Clock, AlertTriangle, Percent } from 'lucide-react';
import type { Invoice } from '@/types/database';

// Tradução do prefixo técnico do review_reason para algo legível em tooltip.
function humanizeReviewReason(reason: string | null): string | undefined {
  if (!reason) return undefined;
  if (reason.startsWith('iva_inconsistente')) {
    return `IVA suspeito — ${reason.replace(/^iva_inconsistente:\s*/, '')}`;
  }
  return reason;
}

// Badge em PT simples mostrado em linhas que precisam de atenção.
// Retorna null quando a fatura está OK (não queremos visualmente ruidoso).
export function StatusBadge({ invoice }: { invoice: Invoice }) {
  if (invoice.status === 'analyzing') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
        <Clock className="h-3 w-3 animate-pulse" />
        A processar
      </span>
    );
  }
  if (invoice.status === 'review' || invoice.status === 'failed') {
    const isIvaInconsistente = invoice.review_reason?.startsWith('iva_inconsistente');
    const label = invoice.status === 'failed'
      ? 'Erro'
      : isIvaInconsistente ? 'IVA suspeito' : 'Verificação manual';
    const Icon = isIvaInconsistente ? Percent : AlertTriangle;
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
        title={humanizeReviewReason(invoice.review_reason)}
      >
        <Icon className="h-3 w-3" />
        {label}
      </span>
    );
  }
  return null;
}
