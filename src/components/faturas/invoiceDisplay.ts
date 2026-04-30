import { formatDatePT } from '@/lib/utils/validation';
import { humanizeReviewReason, parseReviewReason } from '@/lib/reviewReason';
import type { Invoice } from '@/types/database';

// Quando o Gemini rejeita o documento ou a extração falha não temos
// supplier_name nem valor_total — caímos para metadados do email
// (subject, from) capturados no sync, ou para o filename do bucket.
// Mantém Inbox/Ignored e o drawer alinhados na forma de identificar items sem fatura.
function basenameFromPath(path: string | null): string | null {
  if (!path) return null;
  const last = path.split('/').pop();
  if (!last) return null;
  // Remove timestamps de upload tipo "1704067200000-relatorio.pdf"
  const cleaned = last.replace(/^\d{10,}-/, '');
  return cleaned || last;
}

export function invoiceIdentifier(inv: Invoice): { primary: string; secondary: string | null } {
  if (inv.supplier_name) {
    return { primary: inv.supplier_name, secondary: inv.email_subject };
  }
  if (inv.email_subject || inv.email_from) {
    return {
      primary: inv.email_subject || inv.email_from || 'Sem assunto',
      secondary: inv.email_from && inv.email_subject ? inv.email_from : null,
    };
  }
  const filename = basenameFromPath(inv.storage_path);
  if (filename) {
    return { primary: filename, secondary: 'Upload manual' };
  }
  return { primary: 'Documento sem identificação', secondary: null };
}

export function invoiceDisplayDate(inv: Invoice): string {
  return formatDatePT(inv.doc_date || (inv.email_received_at ? inv.email_received_at.slice(0, 10) : null));
}

// Razões de rejeição vão como texto livre (analyze-document → rejectInvoice).
// A 1ª regex que matche vence. Strings com prefixo kind:detail (vocabulário
// reviewReason.ts) são humanizadas via humanizeReviewReason; só caímos aqui
// para legacy ou rejection_reason livre.
const IGNORED_REASON_MAP: Array<[RegExp, string]> = [
  [/(não|nao) (é|e) um documento/i, 'Não era um documento'],
  [/(não|nao) (é|e) uma fatura/i, 'Não era uma fatura'],
  [/(ilegível|ilegivel)/i, 'Documento ilegível'],
  [/(emitida pela própria|emitida pela propria)/i, 'Fatura emitida pela tua empresa (não um custo)'],
];

export function humanIgnoredReason(reason: string | null): string {
  if (!reason) return 'Descartada automaticamente';
  // Se a razão segue o vocabulário kind:detail, deixa o helper canónico
  // formatá-la — assim "Recuperada → ignorada de novo" continua coerente.
  if (parseReviewReason(reason).kind) {
    return humanizeReviewReason(reason) ?? reason;
  }
  for (const [re, msg] of IGNORED_REASON_MAP) {
    if (re.test(reason)) return msg;
  }
  return reason;
}
