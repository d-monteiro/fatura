// Pipeline: Gemini → detect company → Drive upload → DB insert → Sheets append.
// Orquestração; lógica especializada vive em ./tenant, ./dedup, ./upload, ./persist.

import { supabase } from '@/lib/supabase/client';
import { analyzeInvoiceWithGemini, fileToBase64 } from '@/lib/gemini';
import { normalizeSupplierName } from '@/lib/utils/suppliers';
import { validateMontants } from '@/lib/utils/validation';
import { reportError } from '@/lib/errors/errorReporter';
import { track } from '@/lib/analytics/track';
import { EVENTS } from '@/lib/analytics/events';
import type { GeminiInvoiceData, Invoice } from '@/types/database';

import { loadTenantContext, ensureFreshToken, type TenantContext } from './tenant';
import { computeFileHash, findByAttachmentHash, formatDuplicateMessage, checkDuplicate } from './dedup';
import { ensureDriveTarget, uploadFileToDriveTarget } from './upload';
import {
  detectCompanyId,
  matchOrCreateSupplier,
  insertInvoiceRow,
  insertLineItems,
  appendToSheetSafely,
} from './persist';

export interface UploadResult {
  success: boolean;
  invoice?: Invoice;
  error?: string;
  isDuplicate?: boolean;
  warnings?: string[];
}

// Os critérios IVA, NIF e document_type vêm do Edge (analyze-document) via
// `g._validation`, garantindo paridade com o fluxo by-invoice. Aqui só
// adicionamos critérios cliente-only que a Edge não conhece (data suspeita)
// e o resultado do validateMontants cliente, que é redundante mas defensivo
// caso a Edge não tenha enriquecido (fallback grácil).
function evaluateReview(g: GeminiInvoiceData, validationOk: boolean): { needsReview: boolean; reason: string | null } {
  const edge = g._validation;
  const curYear = new Date().getFullYear();
  const suspiciousDate = g.doc_year !== null && g.doc_year < curYear - 1;

  if (edge) {
    if (edge.needs_review) return { needsReview: true, reason: edge.review_reason };
    if (suspiciousDate) return { needsReview: true, reason: 'manual_request: data suspeita' };
    if (!validationOk) return { needsReview: true, reason: 'iva_inconsistente: erro de validação cliente' };
    return { needsReview: false, reason: null };
  }
  // Fallback (Edge sem enrichment, ex: versão antiga em flight): apenas
  // métricas cliente-side. Não é a verdade — para fluxos sem Edge
  // enriquecida, segue o critério antigo.
  const lowConfidence = g.confidence_score < 0.8;
  const needsReview = lowConfidence || suspiciousDate || !validationOk;
  if (!needsReview) return { needsReview: false, reason: null };
  const reason = !validationOk
    ? 'iva_inconsistente: erro de validação de montantes'
    : lowConfidence
      ? `low_confidence: ${g.confidence_score.toFixed(2)}`
      : 'manual_request: data suspeita';
  return { needsReview: true, reason };
}

async function processSingle(
  g: GeminiInvoiceData,
  file: File,
  cid: string,
  userId: string | null,
  token: string,
  tenant: TenantContext,
  attachmentHash: string | null,
): Promise<UploadResult> {
  const warnings: string[] = [];
  g.supplier_name = normalizeSupplierName(g.supplier_name, tenant.knownSuppliers);

  const v = validateMontants(g.valor_sem_iva, g.valor_iva, g.valor_total, g.taxa_iva);
  if (!v.valid) warnings.push(...v.errors);
  if (v.warnings.length) warnings.push(...v.warnings);

  const dup = await checkDuplicate(tenant.id, g, cid);
  if (dup) {
    track(EVENTS.INVOICE_DUPLICATE_BLOCKED, { tenant_id: tenant.id, supplier: g.supplier_name });
    return { success: false, isDuplicate: true, error: dup };
  }

  const { data: co } = await supabase.from('companies').select('short_name, name').eq('id', cid).single();
  const coName = (co?.short_name as string) || (co?.name as string) || 'EMPRESA';

  const target = await ensureDriveTarget(g, file, coName, token, tenant);
  const driveFile = await uploadFileToDriveTarget(file, target.fileName, target.parentFolderId, token);

  const review = evaluateReview(g, v.valid);

  const persisted = await insertInvoiceRow({
    g,
    tenantId: tenant.id,
    userId,
    companyId: cid,
    driveFile: { id: driveFile.id, webViewLink: driveFile.webViewLink },
    spreadsheetId: target.spreadsheetId,
    attachmentHash,
    needsReview: review.needsReview,
    reviewReason: review.reason,
  });

  if (persisted.error || !persisted.invoice) {
    track(EVENTS.INVOICE_ANALYZE_FAILED, {
      tenant_id: tenant.id,
      stage: 'db_insert',
      error_code: persisted.errorCode ?? 'unknown',
    });
    return { success: false, error: `Erro a guardar: ${persisted.error}` };
  }

  track(EVENTS.INVOICE_SAVED, {
    tenant_id: tenant.id,
    company_id: cid,
    category: g.category,
    document_type: g.document_type,
    needs_review: review.needsReview,
    confidence_score: g.confidence_score,
    source: 'upload',
  });

  await insertLineItems(g, persisted.invoice.id, tenant.id);
  await matchOrCreateSupplier(g, persisted.invoice.id, tenant.id);

  if (target.spreadsheetId) {
    const sheetWarning = await appendToSheetSafely(
      g, driveFile.webViewLink, target.spreadsheetId, token, tenant.language, tenant.id, userId,
    );
    if (sheetWarning) warnings.push(sheetWarning);
  }

  return { success: true, invoice: persisted.invoice, warnings: warnings.length ? warnings : undefined };
}

export async function processInvoiceUpload(
  file: File,
  userId: string | null,
  accessToken: string | null,
  defaultCompanyId: string | null,
  tenantId: string | null | undefined,
): Promise<UploadResult[]> {
  try {
    if (!tenantId) return [{ success: false, error: 'Tenant em falta. Complete o onboarding.' }];
    if (file.size > 10 * 1024 * 1024) return [{ success: false, error: 'Ficheiro demasiado grande (máx. 10 MB)' }];
    const ok = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf', 'image/heic', 'image/heif'];
    if (!ok.includes(file.type)) return [{ success: false, error: 'Formato não suportado. Use JPG, PNG, PDF ou HEIC.' }];
    if (!accessToken && !userId) return [{ success: false, error: 'Adicione uma conta Google em Definições.' }];

    const tenant = await loadTenantContext(tenantId);
    if (!tenant) return [{ success: false, error: 'Configuração do tenant não encontrada.' }];

    const attachmentHash = await computeFileHash(file);
    const existing = await findByAttachmentHash(tenantId, attachmentHash);
    if (existing) {
      track(EVENTS.INVOICE_DUPLICATE_BLOCKED, { tenant_id: tenantId, reason: 'attachment_hash' });
      return [{ success: false, isDuplicate: true, error: formatDuplicateMessage(existing) }];
    }

    let token = accessToken;
    if (userId) {
      const fresh = await ensureFreshToken(userId);
      if (fresh) token = fresh;
    }
    if (!token) return [{ success: false, error: 'Token Google expirado. Reconecte em Definições.' }];

    let invoices: GeminiInvoiceData[];
    try {
      invoices = await analyzeInvoiceWithGemini(await fileToBase64(file), file.type, tenantId);
      track(EVENTS.INVOICE_ANALYZE_SUCCEEDED, {
        tenant_id: tenantId,
        count: invoices.length,
        mime: file.type,
      });
    } catch (e) {
      track(EVENTS.INVOICE_ANALYZE_FAILED, {
        tenant_id: tenantId,
        stage: 'gemini',
        message: e instanceof Error ? e.message : 'unknown',
      });
      throw e;
    }

    const results: UploadResult[] = [];
    let hashAssigned = false;
    for (const g of invoices) {
      const cid = await detectCompanyId(tenantId, g.destinatario_nome, defaultCompanyId ?? undefined);
      if (!cid) {
        results.push({ success: false, error: 'Empresa não encontrada para este tenant. Crie pelo menos uma empresa em Definições.' });
        continue;
      }
      const hashForThis = hashAssigned ? null : attachmentHash;
      const result = await processSingle(g, file, cid, userId, token, tenant, hashForThis);
      if (result.success && hashForThis) hashAssigned = true;
      results.push(result);
    }
    return results;
  } catch (error) {
    void reportError(error, {
      component: 'invoiceProcessor/processInvoiceUpload',
      tenantId: tenantId ?? undefined,
      userId: userId ?? undefined,
      extra: { fileName: file.name, fileType: file.type, fileSize: file.size },
    });
    return [{ success: false, error: error instanceof Error ? error.message : 'Erro desconhecido' }];
  }
}
