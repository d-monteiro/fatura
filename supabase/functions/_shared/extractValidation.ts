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

// Tolerância de arredondamento na aritmética de IVA: 5 cêntimos ou 1% do
// total, o que for maior. Faturas de retalho acumulam arredondamentos por
// linha — 0,02 fixo mandava faturas correctas para revisão.
export function ivaTolerance(total: number | null): number {
  return Math.max(0.05, Math.abs(total ?? 0) * 0.01);
}

// Subtipos com IVA estruturado diferente do B2B padrão (seguros têm imposto
// de selo + FGA, telecom tem multi-taxa + taxa audiovisual, banca cobra
// comissões sem IVA escriturado uniforme).
const COMPLEX_TAX_SUBTYPES = new Set(["seguro", "telecom", "utilities", "banca"]);
const SUBTYPES_WITHOUT_IVA = new Set(["seguro", "banca"]);

// Apanha "Fidelidade": taxa_iva=0% mas valor_total > valor_sem_iva, ou
// aritmética inconsistente. Tolerância 2 cêntimos para arredondamentos.
//
// Considera 3 fontes adicionais opcionais do Gemini para documentos compostos:
//   - outros_impostos: [{nome, valor}] — selo, FGA, INEM, taxa audiovisual...
//   - iva_breakdown:   [{taxa, base, valor}] — multi-taxa
//   - document_subtype: "seguro"|"telecom"|"utilities"|"banca"|null — relaxa
//     algumas regras (seguro pode ter taxa_iva=0 mas total > sem_iva por causa
//     do imposto de selo).
//
// Backwards-compatible: ausência destes campos = comportamento original.
export function checkIvaConsistency(row: Record<string, unknown>): IvaCheck {
  const sem = num(row.valor_sem_iva);
  const iva = num(row.valor_iva);
  const total = num(row.valor_total);
  const taxa = num(row.taxa_iva);
  const autoliq = row.autoliquidacao === true;
  const subtype = typeof row.document_subtype === "string"
    ? (row.document_subtype as string).toLowerCase()
    : null;

  if (autoliq) return { ok: true };

  const outrosTotal = sumOutrosImpostos(row.outros_impostos);
  const breakdown = parseBreakdown(row.iva_breakdown);
  const isComplex = subtype != null && COMPLEX_TAX_SUBTYPES.has(subtype);
  const hasOutros = outrosTotal > 0.02;
  const hasBreakdown = breakdown.length > 0;

  // 1. Multi-taxa: somatório do breakdown tem de bater com total (+ outros).
  if (hasBreakdown && total != null) {
    const bases = breakdown.reduce((a, x) => a + x.base, 0);
    const ivas = breakdown.reduce((a, x) => a + x.valor, 0);
    const expected = bases + ivas + outrosTotal;
    if (Math.abs(expected - total) > ivaTolerance(total)) {
      return { ok: false, reason: `breakdown (bases ${bases.toFixed(2)} + ivas ${ivas.toFixed(2)} + outros ${outrosTotal.toFixed(2)}) ≠ total (${total})` };
    }
    // Se chega aqui, breakdown é a fonte canónica e está consistente: skip
    // verificações de taxa única abaixo.
    return { ok: true };
  }

  // 2. Documento composto (seguro/telecom/utilities/banca) com outros_impostos:
  //    aceitar sem_iva + iva + Σ outros = total, mesmo com taxa_iva=0.
  if ((isComplex || hasOutros) && sem != null && iva != null && total != null) {
    const expected = sem + iva + outrosTotal;
    if (Math.abs(expected - total) > ivaTolerance(total)) {
      return { ok: false, reason: `sem_iva (${sem}) + iva (${iva}) + outros (${outrosTotal.toFixed(2)}) ≠ total (${total})` };
    }
    return { ok: true };
  }

  // 3. Seguros/banca às vezes só têm "prémio total + selo" sem IVA escriturado.
  //    Aceitar valor_iva=null/0, taxa_iva=null/0 se outros_impostos cobre o gap.
  if (subtype != null && SUBTYPES_WITHOUT_IVA.has(subtype) && sem != null && total != null) {
    const iva0 = iva ?? 0;
    const expected = sem + iva0 + outrosTotal;
    if (Math.abs(expected - total) > ivaTolerance(total)) {
      return { ok: false, reason: `${subtype}: sem_iva (${sem}) + iva (${iva0}) + outros (${outrosTotal.toFixed(2)}) ≠ total (${total})` };
    }
    return { ok: true };
  }

  // 4. Caso padrão B2B (lógica original).
  if (sem != null && iva != null && total != null) {
    if (Math.abs((sem + iva) - total) > ivaTolerance(total)) {
      return { ok: false, reason: `sem_iva (${sem}) + iva (${iva}) ≠ total (${total})` };
    }
  }
  if (taxa === 0 && iva != null && iva > ivaTolerance(total)) {
    return { ok: false, reason: `taxa_iva 0% mas valor_iva = ${iva}` };
  }
  if (taxa === 0 && sem != null && total != null && Math.abs(total - sem) > ivaTolerance(total)) {
    return { ok: false, reason: `taxa_iva 0% mas total (${total}) ≠ sem_iva (${sem})` };
  }
  if (taxa != null && taxa > 0 && sem != null && total != null) {
    const expected = sem * (1 + taxa / 100);
    if (Math.abs(expected - total) > ivaTolerance(total)) {
      return { ok: false, reason: `total (${total}) não bate com sem_iva×(1+${taxa}%)` };
    }
  }
  return { ok: true };
}

function sumOutrosImpostos(raw: unknown): number {
  if (!Array.isArray(raw)) return 0;
  let total = 0;
  for (const item of raw) {
    if (item && typeof item === "object") {
      const valor = num((item as Record<string, unknown>).valor);
      if (valor != null) total += valor;
    }
  }
  return total;
}

function parseBreakdown(raw: unknown): { taxa: number; base: number; valor: number }[] {
  if (!Array.isArray(raw)) return [];
  const out: { taxa: number; base: number; valor: number }[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const taxa = num(rec.taxa);
    const base = num(rec.base);
    const valor = num(rec.valor);
    if (base != null && valor != null && taxa != null) {
      out.push({ taxa, base, valor });
    }
  }
  return out;
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
