// Padroniza review_reason — mesmo vocabulário usado server-side em
// supabase/functions/_shared/reviewReason.ts. Garante tooltip humano e
// permite filtrar por kind no admin/watchdog.

export type ReviewReasonKind =
  | 'low_confidence'
  | 'iva_inconsistente'
  | 'parse_error'
  | 'timeout'
  | 'document_type_unknown'
  | 'internal_error'
  | 'manual_request'
  | 'sync_cancelled';

const ALL_KINDS: ReviewReasonKind[] = [
  'low_confidence',
  'iva_inconsistente',
  'parse_error',
  'timeout',
  'document_type_unknown',
  'internal_error',
  'manual_request',
  'sync_cancelled',
];

const HUMAN_LABEL: Record<ReviewReasonKind, string> = {
  low_confidence: 'Confiança da IA abaixo de 80% — confirma os campos.',
  iva_inconsistente: 'Aritmética do IVA não fecha (sem IVA + IVA ≠ total).',
  parse_error: 'Não foi possível interpretar a resposta da IA.',
  timeout: 'A análise demorou demasiado. Tenta de novo.',
  document_type_unknown: 'Tipo de documento não está nos aceites para a empresa.',
  internal_error: 'Erro interno na análise.',
  manual_request: 'Marcada manualmente para revisão.',
  sync_cancelled: 'Sincronização cancelada antes de terminar.',
};

export interface ParsedReviewReason {
  kind: ReviewReasonKind | null;
  detail: string | null;
  raw: string | null;
}

export function parseReviewReason(raw: string | null | undefined): ParsedReviewReason {
  if (!raw) return { kind: null, detail: null, raw: null };
  const sep = raw.indexOf(':');
  const head = sep >= 0 ? raw.slice(0, sep).trim() : raw.trim();
  const detail = sep >= 0 ? raw.slice(sep + 1).trim() : null;
  const kind = (ALL_KINDS as string[]).includes(head) ? (head as ReviewReasonKind) : null;
  return { kind, detail: detail || null, raw };
}

// Texto longo para tooltip / explicação na revisão.
export function humanizeReviewReason(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const { kind, detail } = parseReviewReason(raw);
  if (kind) {
    return detail ? `${HUMAN_LABEL[kind]} (${detail})` : HUMAN_LABEL[kind];
  }
  // Razões antigas sem prefixo padronizado: mostra raw.
  return raw;
}
