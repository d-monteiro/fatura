import { Clock, AlertTriangle } from 'lucide-react';
import type { Invoice } from '@/types/database';

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
    const label = invoice.status === 'failed' ? 'Erro' : 'A verificar';
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
        title={invoice.review_reason ?? undefined}
      >
        <AlertTriangle className="h-3 w-3" />
        {label}
      </span>
    );
  }
  return null;
}
