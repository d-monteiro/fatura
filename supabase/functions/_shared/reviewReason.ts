// Razões de revisão / falha — vocabulário fixo para a UI mostrar tooltips
// consistentes e o cron watchdog filtrar. O detalhe vai depois de ":".

export type ReviewReasonKind =
  | 'low_confidence'
  | 'iva_inconsistente'
  | 'parse_error'
  | 'timeout'
  | 'document_type_unknown'
  | 'internal_error'
  | 'manual_request'
  | 'sync_cancelled';

export function buildReviewReason(kind: ReviewReasonKind, detail?: string): string {
  if (!detail) return kind;
  const safe = detail.replace(/\s+/g, ' ').trim().slice(0, 400);
  return `${kind}: ${safe}`;
}

export function reviewReasonKind(reason: string | null | undefined): ReviewReasonKind | null {
  if (!reason) return null;
  const head = reason.split(':')[0]?.trim();
  switch (head) {
    case 'low_confidence':
    case 'iva_inconsistente':
    case 'parse_error':
    case 'timeout':
    case 'document_type_unknown':
    case 'internal_error':
    case 'manual_request':
    case 'sync_cancelled':
      return head;
    default:
      return null;
  }
}
