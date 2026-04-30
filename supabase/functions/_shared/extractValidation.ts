// Validação pós-Gemini que tem de correr nos dois fluxos:
//   - by-invoice (sync-email/reprocess-pending)
//   - upload-directo (drag&drop manual via gemini.ts)
// O fluxo upload-directo escapava todos estes guarda-rails antes do B4.

import { buildReviewReason, type ReviewReasonKind } from "./reviewReason.ts";

// NIF PT canónico: strip de "PT", espaços, não-dígitos. 9 dígitos ou null.
export function normalizeNifPT(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw) return null;
  const digits = raw.replace(/[^\d]/g, "");
  return digits.length === 9 ? digits : null;
}

// Tipos do enum que reconhecemos. Para validar o que o tenant aceita,
// passar `allowedTypes` (Set lowercase). Se vazio, qualquer tipo do enum
// passa.
export const KNOWN_DOCUMENT_TYPES = new Set([
  "fatura", "recibo", "nota_credito", "aviso_pagamento", "outro",
]);

export type IvaCheck = { ok: true } | { ok: false; reason: string };

// Apanha "Fidelidade": taxa_iva=0% mas valor_total > valor_sem_iva, ou
// aritmética inconsistente. Tolerância 2 cêntimos para arredondamentos.
export function checkIvaConsistency(row: Record<string, unknown>): IvaCheck {
  const sem = num(row.valor_sem_iva);
  const iva = num(row.valor_iva);
  const total = num(row.valor_total);
  const taxa = num(row.taxa_iva);
  const autoliq = row.autoliquidacao === true;

  if (autoliq) return { ok: true };

  if (sem != null && iva != null && total != null) {
    if (Math.abs((sem + iva) - total) > 0.02) {
      return { ok: false, reason: `sem_iva (${sem}) + iva (${iva}) ≠ total (${total})` };
    }
  }
  if (taxa === 0 && iva != null && iva > 0.02) {
    return { ok: false, reason: `taxa_iva 0% mas valor_iva = ${iva}` };
  }
  if (taxa === 0 && sem != null && total != null && Math.abs(total - sem) > 0.02) {
    return { ok: false, reason: `taxa_iva 0% mas total (${total}) ≠ sem_iva (${sem})` };
  }
  if (taxa != null && taxa > 0 && sem != null && total != null) {
    const expected = sem * (1 + taxa / 100);
    if (Math.abs(expected - total) > 0.02) {
      return { ok: false, reason: `total (${total}) não bate com sem_iva×(1+${taxa}%)` };
    }
  }
  return { ok: true };
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export interface InvoiceReviewVerdict {
  needsReview: boolean;
  reviewReason: string | null;
  reasonKind: ReviewReasonKind | null;
  normalizedNif: string | null;
  docType: string | null;
}

interface ClassifyOpts {
  allowedTypes: Set<string>;     // tenant.allowed_document_types lowercase. Vazio = aceita qualquer KNOWN
  confidenceThreshold?: number;  // default 0.8
}

// Decisão única partilhada entre os dois fluxos. Devolve o veredito + o
// review_reason já no vocabulário kind:detail.
export function classifyInvoice(
  row: Record<string, unknown>,
  opts: ClassifyOpts,
): InvoiceReviewVerdict {
  const threshold = opts.confidenceThreshold ?? 0.8;
  const confidence = num(row.confidence_score) ?? 0;
  const ivaCheck = checkIvaConsistency(row);
  const lowConfidence = confidence < threshold;

  const docType = typeof row.document_type === "string"
    ? (row.document_type as string).toLowerCase()
    : null;
  const docTypeKnown = !docType
    || (opts.allowedTypes.size > 0
      ? opts.allowedTypes.has(docType)
      : KNOWN_DOCUMENT_TYPES.has(docType));

  const needsReview = lowConfidence || !ivaCheck.ok || !docTypeKnown;

  let reasonKind: ReviewReasonKind | null = null;
  let reviewReason: string | null = null;
  if (!ivaCheck.ok) {
    reasonKind = "iva_inconsistente";
    reviewReason = buildReviewReason("iva_inconsistente", ivaCheck.reason);
  } else if (!docTypeKnown) {
    reasonKind = "document_type_unknown";
    reviewReason = buildReviewReason("document_type_unknown", docType ?? "");
  } else if (lowConfidence) {
    reasonKind = "low_confidence";
    reviewReason = buildReviewReason("low_confidence", confidence.toFixed(2));
  }

  return {
    needsReview,
    reviewReason,
    reasonKind,
    normalizedNif: normalizeNifPT(row.supplier_nif),
    docType,
  };
}
