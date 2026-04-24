// Pipeline: Gemini → detect company → Drive upload → DB insert → Sheets append.
import { supabase } from '@/lib/supabase/client';
import { analyzeInvoiceWithGemini, fileToBase64 } from '@/lib/gemini';
import { uploadInvoiceToDrive, ensureFolder, getOrCreateYearlySheet } from '@/lib/google/drive';
import { appendInvoiceToSheet } from '@/lib/google/sheets';
import { normalizeSupplierName, type KnownSupplier } from '@/lib/utils/suppliers';
import { validateMontants } from '@/lib/utils/validation';
import { formatMonthFolder } from '@/lib/utils/months';
import { reportError } from '@/lib/errors/errorReporter';
import { track } from '@/lib/analytics/track';
import { EVENTS } from '@/lib/analytics/events';
import type { Invoice, GeminiInvoiceData } from '@/types/database';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

interface TenantContext {
  id: string;
  language: string;
  folderStructure: string;
  rootFolderName: string;
  autoSheets: boolean;
  knownSuppliers: KnownSupplier[];
}

async function loadTenantContext(tenantId: string): Promise<TenantContext | null> {
  const { data: t } = await supabase.from('tenants')
    .select('id, language, folder_structure, drive_root_folder_name, auto_sheets')
    .eq('id', tenantId).is('deleted_at', null).single();
  if (!t) return null;

  const { data: suppliers } = await supabase.from('suppliers')
    .select('name, name_variations').eq('tenant_id', tenantId).limit(200);

  const known: KnownSupplier[] = (suppliers ?? []).map((s) => ({
    normalized: s.name as string,
    variations: ((s.name_variations as string[]) ?? []),
  }));

  return {
    id: t.id as string,
    language: (t.language as string) ?? 'pt',
    folderStructure: (t.folder_structure as string) ?? 'year_month',
    rootFolderName: (t.drive_root_folder_name as string) ?? 'FATURAS',
    autoSheets: t.auto_sheets !== false,
    knownSuppliers: known,
  };
}

async function ensureFreshToken(userId: string): Promise<string | null> {
  const { data: row } = await supabase.from('user_oauth_tokens').select('id, email, access_token, refresh_token, token_expiry')
    .eq('user_id', userId).eq('provider', 'google').order('is_primary_storage', { ascending: false }).limit(1).single();
  if (!row) return null;
  if (row.token_expiry && new Date(row.token_expiry) > new Date(Date.now() + 5 * 60 * 1000)) return row.access_token;
  if (!row.refresh_token || !row.email) return null;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;
    const res = await fetch(`${SUPABASE_URL}/functions/v1/refresh-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ email: row.email }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      void reportError(`refresh-token endpoint falhou (${res.status})`, {
        component: 'invoiceProcessor/ensureFreshToken',
        userId,
        extra: { status: res.status, body: body.slice(0, 500) },
      });
      return null;
    }
    // Edge Function persiste o novo access_token na BD mas não o devolve na resposta.
    // Reler da BD para obter o token acabado de renovar.
    const { data: refreshed } = await supabase.from('user_oauth_tokens')
      .select('access_token').eq('id', row.id).single();
    return refreshed?.access_token || null;
  } catch (err) {
    void reportError(err, {
      component: 'invoiceProcessor/ensureFreshToken',
      userId,
      extra: { phase: 'network' },
    });
    return null;
  }
}

export interface UploadResult {
  success: boolean; invoice?: Invoice; error?: string; isDuplicate?: boolean; warnings?: string[];
}

async function detectCompanyId(tenantId: string, dest: string | null, fallback?: string): Promise<string | null> {
  if (dest) {
    const { data } = await supabase.from('companies')
      .select('id, name, short_name').eq('tenant_id', tenantId).eq('is_active', true);
    const d = dest.toLowerCase();
    const match = data?.find(c => d.includes((c.name as string).toLowerCase()) || d.includes((c.short_name as string).toLowerCase()));
    if (match) return match.id as string;
  }
  if (fallback) return fallback;
  const { data: first } = await supabase.from('companies')
    .select('id').eq('tenant_id', tenantId).eq('is_active', true)
    .order('is_default', { ascending: false }).order('name').limit(1).single();
  return (first?.id as string) ?? null;
}

async function checkDuplicate(tenantId: string, g: GeminiInvoiceData, cid: string): Promise<string | null> {
  const label = `${g.supplier_name} - ${g.doc_date} (${g.montant_ttc?.toFixed(2)} €)`;
  if (g.doc_number) {
    const { data } = await supabase.from('invoices').select('id').eq('tenant_id', tenantId).eq('company_id', cid)
      .ilike('doc_number', g.doc_number).is('deleted_at', null).limit(1);
    if (data?.length) return `Fatura duplicada: ${label} | Doc: ${g.doc_number}`;
  } else {
    const { data } = await supabase.from('invoices').select('id, summary').eq('tenant_id', tenantId).eq('company_id', cid)
      .ilike('supplier_name', g.supplier_name || '').eq('doc_date', g.doc_date)
      .eq('montant_ttc', g.montant_ttc).is('deleted_at', null).limit(5);
    if (data?.some(d => ((d.summary as string) || '').toLowerCase().trim() === (g.summary || '').toLowerCase().trim()))
      return `Fatura duplicada: ${label}`;
  }
  return null;
}

async function matchOrCreateSupplier(g: GeminiInvoiceData, invId: string, tenantId: string) {
  if (!g.supplier_name) return;
  const { data: ex } = await supabase.from('suppliers').select('id')
    .eq('tenant_id', tenantId).eq('name', g.supplier_name).maybeSingle();
  if (ex) { await supabase.from('invoices').update({ supplier_id: ex.id }).eq('id', invId); return; }
  const { data: ns } = await supabase.from('suppliers').insert({
    tenant_id: tenantId,
    name: g.supplier_name, display_name: g.supplier_name, nif: g.supplier_nif ?? null,
    is_subcontractor: g.autoliquidation,
  }).select('id').single();
  if (ns) await supabase.from('invoices').update({ supplier_id: ns.id }).eq('id', invId);
}

function buildFolderPath(structure: string, root: string, companyName: string, year: number, monthLabel: string, costTypeLabel: string, supplierName: string): string[] {
  switch (structure) {
    case 'year_type':
      return [root, companyName, String(year), costTypeLabel || 'Outros'];
    case 'year_supplier':
      return [root, companyName, String(year), supplierName || 'OUTROS'];
    case 'year_month':
    default:
      return [root, companyName, String(year), monthLabel];
  }
}

async function processSingle(
  g: GeminiInvoiceData, file: File, cid: string, userId: string | null, token: string, tenant: TenantContext,
): Promise<UploadResult> {
  const w: string[] = [];
  g.supplier_name = normalizeSupplierName(g.supplier_name, tenant.knownSuppliers);
  const v = validateMontants(g.montant_ht, g.montant_tva, g.montant_ttc, g.taux_tva);
  if (!v.valid) w.push(...v.errors);
  if (v.warnings.length) w.push(...v.warnings);

  const dup = await checkDuplicate(tenant.id, g, cid);
  if (dup) {
    track(EVENTS.INVOICE_DUPLICATE_BLOCKED, {
      tenant_id: tenant.id,
      supplier: g.supplier_name,
    });
    return { success: false, isDuplicate: true, error: dup };
  }

  const { data: co } = await supabase.from('companies').select('short_name, name').eq('id', cid).single();
  const coName = (co?.short_name as string) || (co?.name as string) || 'EMPRESA';
  const year = g.doc_year || new Date().getFullYear();
  const monthIdx = g.doc_date ? new Date(g.doc_date).getMonth() : new Date().getMonth();
  const monthLabel = formatMonthFolder(monthIdx, tenant.language);
  const costTypeLabel = g.cost_type ? g.cost_type.charAt(0).toUpperCase() + g.cost_type.slice(1).replace(/_/g, ' ') : 'Outros';

  const path = buildFolderPath(tenant.folderStructure, tenant.rootFolderName, coName, year, monthLabel, costTypeLabel, g.supplier_name || 'OUTROS');

  let parentId = '';
  for (const segment of path) {
    parentId = await ensureFolder(token, segment, parentId || undefined);
  }

  // Sheet anual fica na pasta do ano (segundo nível abaixo da empresa)
  let sheetId: string | null = null;
  if (tenant.autoSheets) {
    const yearFolder = await ensureFolder(token, String(year), await ensureFolder(token, coName, await ensureFolder(token, tenant.rootFolderName)));
    sheetId = await getOrCreateYearlySheet(token, year, yearFolder, tenant.language);
  }

  const ext = file.type === 'application/pdf' ? 'pdf' : file.type === 'image/png' ? 'png' : 'jpg';
  const fName = `${g.doc_date}_${g.supplier_name}_${g.montant_ttc?.toFixed(2) || '0.00'}.${ext}`.replace(/[/\\?%*:|"<>]/g, '_');
  const buf = await file.arrayBuffer();
  const df = await uploadInvoiceToDrive(token, new Uint8Array(buf), fName, parentId, file.type);

  const curYear = new Date().getFullYear();
  // Gemini devolve confidence em 0-1
  const CONFIDENCE_THRESHOLD = 0.8;
  const review = g.confidence_score < CONFIDENCE_THRESHOLD || (g.doc_year !== null && g.doc_year < curYear - 1) || !v.valid;
  const reviewReason = review
    ? (!v.valid ? 'Erro de validação de montantes' : g.confidence_score < CONFIDENCE_THRESHOLD ? 'Confiança baixa' : 'Data suspeita')
    : null;

  const { data: inv, error: err } = await supabase.from('invoices').insert({
    tenant_id: tenant.id, user_id: userId, company_id: cid, source: 'upload',
    file_url: df.webViewLink, drive_link: df.webViewLink, drive_file_id: df.id, spreadsheet_id: sheetId,
    document_type: g.document_type, cost_type: g.cost_type, metier: g.metier, nature_depense: g.nature_depense,
    doc_date: g.doc_date, doc_year: g.doc_year, date_echeance: g.date_echeance,
    supplier_name: g.supplier_name, supplier_nif: g.supplier_nif, doc_number: g.doc_number,
    montant_ht: g.montant_ht, taux_tva: g.taux_tva, montant_tva: g.montant_tva, montant_ttc: g.montant_ttc,
    autoliquidation: g.autoliquidation, payment_method: g.payment_method, supplier_iban: g.supplier_iban,
    summary: g.summary, confidence_score: g.confidence_score,
    status: review ? 'review' : 'inbox', manual_review: review, review_reason: reviewReason,
  }).select().single();
  if (err) {
    track(EVENTS.INVOICE_ANALYZE_FAILED, {
      tenant_id: tenant.id,
      stage: 'db_insert',
      error_code: err.code ?? 'unknown',
    });
    return { success: false, error: `Erro a guardar: ${err.message}` };
  }

  track(EVENTS.INVOICE_SAVED, {
    tenant_id: tenant.id,
    company_id: cid,
    cost_type: g.cost_type,
    document_type: g.document_type,
    needs_review: review,
    confidence_score: g.confidence_score,
    source: 'upload',
  });

  if (g.line_items?.length && inv) {
    await supabase.from('invoice_line_items').insert(g.line_items.map((li, i) => ({
      tenant_id: tenant.id,
      invoice_id: inv.id, line_number: i + 1, description: li.description,
      quantity: li.quantity, unit: li.unit, unit_price_ht: li.unit_price_ht, total_ht: li.total_ht, taux_tva: li.taux_tva,
    })));
  }
  await matchOrCreateSupplier(g, (inv as { id: string }).id, tenant.id);

  if (sheetId) {
    try {
      await appendInvoiceToSheet(token, sheetId, {
        doc_date: g.doc_date, supplier_name: g.supplier_name, supplier_nif: g.supplier_nif,
        metier: g.metier, nature_depense: g.nature_depense, cost_type: g.cost_type, doc_number: g.doc_number,
        montant_ht: g.montant_ht, montant_tva: g.montant_tva, montant_ttc: g.montant_ttc,
        taux_tva: g.taux_tva, summary: g.summary, drive_link: df.webViewLink,
      }, tenant.language);
    } catch (err) {
      void reportError(err, {
        component: 'invoiceProcessor/sheetsAppend',
        tenantId: tenant.id,
        userId: userId ?? undefined,
        level: 'warn',
        extra: { sheetId },
      });
      w.push('Falha na sincronização com Google Sheets (fatura guardada)');
    }
  }

  return { success: true, invoice: inv as Invoice, warnings: w.length ? w : undefined };
}

export async function processInvoiceUpload(
  file: File, userId: string | null, accessToken: string | null, defaultCompanyId: string | null, tenantId: string | null | undefined,
): Promise<UploadResult[]> {
  try {
    if (!tenantId) return [{ success: false, error: 'Tenant em falta. Complete o onboarding.' }];
    if (file.size > 10 * 1024 * 1024) return [{ success: false, error: 'Ficheiro demasiado grande (máx. 10 MB)' }];
    const ok = ['image/jpeg','image/png','image/jpg','application/pdf','image/heic','image/heif'];
    if (!ok.includes(file.type)) return [{ success: false, error: 'Formato não suportado. Use JPG, PNG, PDF ou HEIC.' }];
    if (!accessToken && !userId) return [{ success: false, error: 'Adicione uma conta Google em Definições.' }];

    const tenant = await loadTenantContext(tenantId);
    if (!tenant) return [{ success: false, error: 'Configuração do tenant não encontrada.' }];

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
    for (const g of invoices) {
      const cid = await detectCompanyId(tenantId, g.destinataire_name, defaultCompanyId ?? undefined);
      if (!cid) { results.push({ success: false, error: 'Empresa não encontrada para este tenant. Crie pelo menos uma empresa em Definições.' }); continue; }
      results.push(await processSingle(g, file, cid, userId, token!, tenant));
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
