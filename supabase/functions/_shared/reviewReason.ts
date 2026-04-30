// Razões de revisão / falha — vocabulário fixo para a UI mostrar tooltips
// consistentes e o cron watchdog filtrar. O detalhe vai depois de ":".
//
//   low_confidence: <score>
//   iva_inconsistente: <explicação humana>
//   parse_error: <mensagem técnica>
//   timeout
//   document_type_unknown: <tipo recebido>
//   internal_error: <mensagem>
//   manual_request
//
// Quando a UI lê review_reason, mostra a chave traduzida + o detalhe em tooltip.

export type ReviewReasonKind =
  | 'low_confidence'
  | 'iva_inconsistente'
  | 'parse_error'
  | 'timeout'
  | 'document_type_unknown'
  | 'internal_error'
  | 'manual_request';

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
      return head;
    default:
      return null;
  }
}
