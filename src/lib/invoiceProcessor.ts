/** Pipeline factures: Gemini -> auto-detect entreprise -> Drive -> DB -> Sheets */
import { supabase } from '@/lib/supabase/client';
import { analyzeInvoiceWithGemini, fileToBase64 } from '@/lib/gemini';
import { uploadInvoiceToDrive, ensureFolder, getOrCreateYearlySheet } from '@/lib/google/drive';
import { appendInvoiceToSheet } from '@/lib/google/sheets';
import { normalizeSupplierName } from '@/lib/utils/suppliers';
import { validateMontants } from '@/lib/utils/validation';
import type { Invoice, GeminiInvoiceData } from '@/types/database';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

/** Refresh Google access token if expired. Returns fresh token. */
async function ensureFreshToken(userId: string): Promise<string | null> {
  const { data: row } = await supabase.from('user_oauth_tokens').select('id, email, access_token, refresh_token, token_expiry')
    .eq('user_id', userId).eq('provider', 'google').order('is_primary_storage', { ascending: false }).limit(1).single();
  if (!row) return null;
  // If token not expired yet (with 5min buffer), use it
  if (row.token_expiry && new Date(row.token_expiry) > new Date(Date.now() + 5 * 60 * 1000)) return row.access_token;
  // Token expired - refresh via Edge Function (expects { email }, needs auth)
  if (!row.refresh_token || !row.email) return null;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const authToken = session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY;
    const res = await fetch(`${SUPABASE_URL}/functions/v1/refresh-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({ email: row.email }),
    });
    if (!res.ok) return null;
    const result = await res.json();
    if (result.refreshed) {
      // Re-fetch the updated token from DB
      const { data: updated } = await supabase.from('user_oauth_tokens').select('access_token')
        .eq('id', row.id).single();
      return updated?.access_token || null;
    }
    // Token was still valid
    return row.access_token;
  } catch { return null; }
}

export interface UploadResult {
  success: boolean; invoice?: Invoice; error?: string; isDuplicate?: boolean; warnings?: string[];
}

const MONTH_FR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

async function detectCompanyId(dest: string | null, fallback?: string): Promise<string | null> {
  if (dest) {
    const { data } = await supabase.from('companies').select('id, name, short_name').eq('is_active', true);
    const d = dest.toLowerCase();
    const match = data?.find(c => d.includes(c.name.toLowerCase()) || d.includes(c.short_name.toLowerCase()));
    if (match) return match.id;
  }
  if (fallback) return fallback;
  const { data: first } = await supabase.from('companies').select('id').eq('is_active', true).order('name').limit(1).single();
  return first?.id ?? null;
}

async function checkDuplicate(g: GeminiInvoiceData, cid: string): Promise<string | null> {
  const label = `${g.supplier_name} - ${g.doc_date} (${g.montant_ttc?.toFixed(2)}€)`;
  if (g.doc_number) {
    const { data } = await supabase.from('invoices').select('id').eq('company_id', cid)
      .ilike('doc_number', g.doc_number).is('deleted_at', null).limit(1);
    if (data?.length) return `Facture en double: ${label} | Doc: ${g.doc_number}`;
  } else {
    const { data } = await supabase.from('invoices').select('id, summary').eq('company_id', cid)
      .ilike('supplier_name', g.supplier_name || '').eq('doc_date', g.doc_date)
      .eq('montant_ttc', g.montant_ttc).is('deleted_at', null).limit(5);
    if (data?.some(d => (d.summary || '').toLowerCase().trim() === (g.summary || '').toLowerCase().trim()))
      return `Facture en double: ${label}`;
  }
  return null;
}

async function matchOrCreateSupplier(g: GeminiInvoiceData, invId: string) {
  if (!g.supplier_name) return;
  const { data: ex } = await supabase.from('suppliers').select('id').eq('name', g.supplier_name).single();
  if (ex) { await supabase.from('invoices').update({ supplier_id: ex.id }).eq('id', invId); return; }
  const { data: ns } = await supabase.from('suppliers').insert({
    name: g.supplier_name, display_name: g.supplier_name, siret: g.supplier_siret,
    is_sous_traitant: g.autoliquidation, default_metier: g.metier,
    default_nature: g.nature_depense, default_cost_type: g.cost_type,
  }).select('id').single();
  if (ns) await supabase.from('invoices').update({ supplier_id: ns.id }).eq('id', invId);
}

async function processSingle(
  g: GeminiInvoiceData, file: File, cid: string, userId: string | null, token: string,
): Promise<UploadResult> {
  const w: string[] = [];
  g.supplier_name = normalizeSupplierName(g.supplier_name);
  const v = validateMontants(g.montant_ht, g.montant_tva, g.montant_ttc, g.taux_tva);
  if (!v.valid) w.push(...v.errors);
  if (v.warnings.length) w.push(...v.warnings);

  const dup = await checkDuplicate(g, cid);
  if (dup) return { success: false, isDuplicate: true, error: dup };

  const { data: co } = await supabase.from('companies').select('short_name').eq('id', cid).single();
  const coName = co?.short_name || 'LGM';
  const year = g.doc_year || new Date().getFullYear();
  const month = g.doc_date ? new Date(g.doc_date).getMonth() : new Date().getMonth();
  const mLabel = `${String(month + 1).padStart(2, '0')} - ${MONTH_FR[month]}`;
  const metier = g.metier ? g.metier.charAt(0).toUpperCase() + g.metier.slice(1).replace(/_/g, ' ') : 'Autre';

  const root = await ensureFolder(token, 'FACTURES');
  const cF = await ensureFolder(token, coName, root);
  const yF = await ensureFolder(token, year.toString(), cF);
  const mF = await ensureFolder(token, mLabel, yF);
  const metF = await ensureFolder(token, metier, mF);
  const sheetId = await getOrCreateYearlySheet(token, year, yF);

  const ext = file.type === 'application/pdf' ? 'pdf' : file.type === 'image/png' ? 'png' : 'jpg';
  const fName = `${g.doc_date}_${g.supplier_name}_${g.montant_ttc?.toFixed(2) || '0.00'}.${ext}`.replace(/[/\\?%*:|"<>]/g, '_');
  const buf = await file.arrayBuffer();
  const df = await uploadInvoiceToDrive(token, new Uint8Array(buf), fName, metF, file.type);

  const curYear = new Date().getFullYear();
  const review = g.confidence_score < 70 || (g.doc_year !== null && g.doc_year < curYear - 1) || !v.valid;
  const { data: inv, error: err } = await supabase.from('invoices').insert({
    user_id: userId, company_id: cid, source: 'upload',
    file_url: df.webViewLink, drive_link: df.webViewLink, drive_file_id: df.id, spreadsheet_id: sheetId,
    document_type: g.document_type, cost_type: g.cost_type, metier: g.metier, nature_depense: g.nature_depense,
    doc_date: g.doc_date, doc_year: g.doc_year, date_echeance: g.date_echeance,
    supplier_name: g.supplier_name, supplier_siret: g.supplier_siret, doc_number: g.doc_number,
    montant_ht: g.montant_ht, taux_tva: g.taux_tva, montant_tva: g.montant_tva, montant_ttc: g.montant_ttc,
    autoliquidation: g.autoliquidation, payment_method: g.payment_method, supplier_iban: g.supplier_iban,
    summary: g.summary, confidence_score: g.confidence_score,
    status: review ? 'review' : 'processed', manual_review: review,
    review_reason: review ? (!v.valid ? 'Erreur validation montants' : g.confidence_score < 70 ? 'Confiance faible' : 'Date suspecte') : null,
  }).select().single();
  if (err) return { success: false, error: `Erreur sauvegarde: ${err.message}` };

  if (g.line_items?.length && inv) {
    await supabase.from('invoice_line_items').insert(g.line_items.map((li, i) => ({
      invoice_id: inv.id, line_number: i + 1, description: li.description,
      quantity: li.quantity, unit: li.unit, unit_price_ht: li.unit_price_ht, total_ht: li.total_ht, taux_tva: li.taux_tva,
    })));
  }
  await matchOrCreateSupplier(g, inv!.id);

  try {
    await appendInvoiceToSheet(token, sheetId, {
      doc_date: g.doc_date, supplier_name: g.supplier_name, supplier_siret: g.supplier_siret,
      metier: g.metier, nature_depense: g.nature_depense, cost_type: g.cost_type, doc_number: g.doc_number,
      montant_ht: g.montant_ht, montant_tva: g.montant_tva, montant_ttc: g.montant_ttc,
      taux_tva: g.taux_tva, summary: g.summary, drive_link: df.webViewLink,
    });
  } catch { w.push('Échec sync Google Sheets (facture sauvegardée quand même)'); }

  return { success: true, invoice: inv as Invoice, warnings: w.length ? w : undefined };
}

export async function processInvoiceUpload(
  file: File, userId: string | null, accessToken: string | null, defaultCompanyId?: string | null,
): Promise<UploadResult[]> {
  try {
    if (file.size > 10 * 1024 * 1024) return [{ success: false, error: 'Fichier trop volumineux (max 10 Mo)' }];
    const ok = ['image/jpeg','image/png','image/jpg','application/pdf','image/heic','image/heif'];
    if (!ok.includes(file.type)) return [{ success: false, error: 'Format non supporté. Utilisez JPG, PNG, PDF ou HEIC.' }];
    if (!accessToken && !userId) return [{ success: false, error: 'Ajoutez un compte Google dans Paramètres.' }];

    // Auto-refresh token if expired
    let token = accessToken;
    if (userId) {
      const fresh = await ensureFreshToken(userId);
      if (fresh) token = fresh;
    }
    if (!token) return [{ success: false, error: 'Token Google expiré. Reconnectez dans Paramètres.' }];

    const invoices = await analyzeInvoiceWithGemini(await fileToBase64(file), file.type);
    const results: UploadResult[] = [];
    for (const g of invoices) {
      const cid = await detectCompanyId(g.destinataire_name, defaultCompanyId ?? undefined);
      if (!cid) { results.push({ success: false, error: 'Entreprise non trouvée' }); continue; }
      results.push(await processSingle(g, file, cid, userId, token!));
    }
    return results;
  } catch (error) {
    return [{ success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' }];
  }
}
