import { supabase } from '@/lib/supabase/client';
import { appendInvoiceToSheet } from '@/lib/google/sheets';
import { reportError } from '@/lib/errors/errorReporter';
import type { GeminiInvoiceData, Invoice } from '@/types/database';

export async function detectCompanyId(
  tenantId: string,
  dest: string | null,
  fallback?: string,
): Promise<string | null> {
  if (dest) {
    const { data } = await supabase.from('companies')
      .select('id, name, short_name, invoice_name_variations')
      .eq('tenant_id', tenantId).eq('is_active', true);
    const d = dest.toLowerCase();
    const match = data?.find((c) => {
      const needles = [
        c.name as string,
        (c.short_name as string) ?? '',
        ...((c.invoice_name_variations as string[]) ?? []),
      ]
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s.length >= 3);
      return needles.some((n) => d.includes(n));
    });
    if (match) return match.id as string;
  }
  if (fallback) return fallback;
  const { data: first } = await supabase.from('companies')
    .select('id').eq('tenant_id', tenantId).eq('is_active', true)
    .order('is_default', { ascending: false }).order('name').limit(1).single();
  return (first?.id as string) ?? null;
}

export async function matchOrCreateSupplier(g: GeminiInvoiceData, invId: string, tenantId: string): Promise<void> {
  if (!g.supplier_name) return;
  const { data: ex } = await supabase.from('suppliers').select('id')
    .eq('tenant_id', tenantId).eq('name', g.supplier_name).maybeSingle();
  if (ex) {
    await supabase.from('invoices').update({ supplier_id: ex.id }).eq('id', invId);
    return;
  }
  const { data: ns } = await supabase.from('suppliers').insert({
    tenant_id: tenantId,
    name: g.supplier_name,
    display_name: g.supplier_name,
    nif: g.supplier_nif ?? null,
    is_subcontractor: g.autoliquidacao,
  }).select('id').single();
  if (ns) await supabase.from('invoices').update({ supplier_id: ns.id }).eq('id', invId);
}

export interface PersistArgs {
  g: GeminiInvoiceData;
  tenantId: string;
  userId: string | null;
  companyId: string;
  driveFile: { id: string; webViewLink: string };
  spreadsheetId: string | null;
  attachmentHash: string | null;
  needsReview: boolean;
  reviewReason: string | null;
}

export async function insertInvoiceRow(a: PersistArgs): Promise<{ invoice: Invoice | null; error: string | null; errorCode?: string }> {
  const { g, tenantId, userId, companyId, driveFile, spreadsheetId, attachmentHash, needsReview, reviewReason } = a;
  const { data: inv, error } = await supabase.from('invoices').insert({
    tenant_id: tenantId,
    user_id: userId,
    company_id: companyId,
    source: 'upload',
    file_url: driveFile.webViewLink,
    drive_link: driveFile.webViewLink,
    drive_file_id: driveFile.id,
    spreadsheet_id: spreadsheetId,
    document_type: g.document_type,
    category: g.category,
    doc_date: g.doc_date,
    doc_year: g.doc_year,
    data_vencimento: g.data_vencimento,
    supplier_name: g.supplier_name,
    supplier_nif: g.supplier_nif,
    doc_number: g.doc_number,
    valor_sem_iva: g.valor_sem_iva,
    taxa_iva: g.taxa_iva,
    valor_iva: g.valor_iva,
    valor_total: g.valor_total,
    autoliquidacao: g.autoliquidacao,
    payment_method: g.payment_method,
    supplier_iban: g.supplier_iban,
    summary: g.summary,
    confidence_score: g.confidence_score,
    status: needsReview ? 'review' : 'processed',
    manual_review: needsReview,
    review_reason: reviewReason,
    attachment_hash: attachmentHash,
  }).select().single();

  if (error) return { invoice: null, error: error.message, errorCode: error.code ?? 'unknown' };
  return { invoice: inv as Invoice, error: null };
}

export async function insertLineItems(g: GeminiInvoiceData, invoiceId: string, tenantId: string): Promise<void> {
  if (!g.line_items?.length) return;
  await supabase.from('invoice_line_items').insert(
    g.line_items.map((li, i) => ({
      tenant_id: tenantId,
      invoice_id: invoiceId,
      line_number: i + 1,
      description: li.description,
      quantity: li.quantity,
      unit: li.unit,
      preco_unitario: li.preco_unitario,
      total_sem_iva: li.total_sem_iva,
      taxa_iva: li.taxa_iva,
    })),
  );
}

export async function appendToSheetSafely(
  g: GeminiInvoiceData,
  driveLink: string,
  spreadsheetId: string,
  token: string,
  language: string,
  tenantId: string,
  userId: string | null,
): Promise<string | null> {
  try {
    await appendInvoiceToSheet(token, spreadsheetId, {
      doc_date: g.doc_date,
      supplier_name: g.supplier_name,
      supplier_nif: g.supplier_nif,
      category: g.category,
      doc_number: g.doc_number,
      valor_sem_iva: g.valor_sem_iva,
      valor_iva: g.valor_iva,
      valor_total: g.valor_total,
      taxa_iva: g.taxa_iva,
      summary: g.summary,
      drive_link: driveLink,
    }, language);
    return null;
  } catch (err) {
    void reportError(err, {
      component: 'invoiceProcessor/sheetsAppend',
      tenantId,
      userId: userId ?? undefined,
      level: 'warn',
      extra: { sheetId: spreadsheetId },
    });
    return 'Falha na sincronização com Google Sheets (fatura guardada)';
  }
}
