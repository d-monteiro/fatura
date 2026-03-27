/**
 * PIPELINE COMPLET DE TRAITEMENT DE FACTURES
 * 1. Valider fichier → 2. Analyser Gemini → 3. Normaliser fournisseur
 * 4. Vérifier doublons → 5. Upload Drive → 6. Sauvegarder DB → 7. Sheets
 */

import { supabase } from '@/lib/supabase/client';
import { analyzeInvoiceWithGemini, fileToBase64 } from '@/lib/gemini';
import { uploadInvoiceToDrive, ensureFolder, getOrCreateYearlySheet } from '@/lib/google/drive';
import { appendInvoiceToSheet } from '@/lib/google/sheets';
import { normalizeSupplierName } from '@/lib/utils/suppliers';
import { validateMontants } from '@/lib/utils/validation';
import type { Invoice, GeminiInvoiceData } from '@/types/database';

export interface UploadResult {
  success: boolean;
  invoice?: Invoice;
  error?: string;
  isDuplicate?: boolean;
  warnings?: string[];
}

const MONTH_NAMES_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
];

export async function processInvoiceUpload(
  file: File,
  companyId: string,
  userId: string | null = null,
  accessToken: string | null = null
): Promise<UploadResult> {
  const warnings: string[] = [];

  try {
    // 1. VALIDATION
    if (file.size > 10 * 1024 * 1024) {
      return { success: false, error: 'Fichier trop volumineux (max 10 Mo)' };
    }

    const allowed = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf', 'image/heic', 'image/heif'];
    if (!allowed.includes(file.type)) {
      return { success: false, error: 'Format non supporté. Utilisez JPG, PNG, PDF ou HEIC.' };
    }

    if (!accessToken) {
      return { success: false, error: 'Ajoutez un compte Google dans Automatisations.' };
    }

    // 2. ANALYSE GEMINI
    const base64 = await fileToBase64(file);
    const gemini: GeminiInvoiceData = await analyzeInvoiceWithGemini(base64, file.type);

    // 3. NORMALISER FOURNISSEUR
    gemini.supplier_name = normalizeSupplierName(gemini.supplier_name);

    // 3b. VALIDER MONTANTS
    const validation = validateMontants(gemini.montant_ht, gemini.montant_tva, gemini.montant_ttc, gemini.taux_tva);
    if (!validation.valid) warnings.push(...validation.errors);
    if (validation.warnings.length) warnings.push(...validation.warnings);

    // 4. DOUBLONS
    if (gemini.doc_number) {
      const { data: dups } = await supabase
        .from('invoices')
        .select('id, doc_number')
        .eq('company_id', companyId)
        .ilike('doc_number', gemini.doc_number)
        .is('deleted_at', null)
        .limit(1);
      if (dups && dups.length > 0) {
        return {
          success: false, isDuplicate: true,
          error: `Facture en double: ${gemini.supplier_name} - ${gemini.doc_date} (${gemini.montant_ttc?.toFixed(2)}€) | Doc: ${gemini.doc_number}`,
        };
      }
    } else {
      const { data: dups } = await supabase
        .from('invoices')
        .select('id, summary')
        .eq('company_id', companyId)
        .ilike('supplier_name', gemini.supplier_name || '')
        .eq('doc_date', gemini.doc_date)
        .eq('montant_ttc', gemini.montant_ttc)
        .is('deleted_at', null)
        .limit(5);
      if (dups?.some(d => (d.summary || '').toLowerCase().trim() === (gemini.summary || '').toLowerCase().trim())) {
        return {
          success: false, isDuplicate: true,
          error: `Facture en double: ${gemini.supplier_name} - ${gemini.doc_date} (${gemini.montant_ttc?.toFixed(2)}€)`,
        };
      }
    }

    // 5. GOOGLE DRIVE — FACTURES > {ENTREPRISE} > {ANNEE} > {MM - Mois} > {Métier}
    const year = gemini.doc_year || new Date().getFullYear();
    const month = gemini.doc_date ? new Date(gemini.doc_date).getMonth() : new Date().getMonth();
    const monthFolder = `${String(month + 1).padStart(2, '0')} - ${MONTH_NAMES_FR[month]}`;

    // Get company short name
    const { data: company } = await supabase.from('companies').select('short_name').eq('id', companyId).single();
    const companyName = company?.short_name || 'LGM';

    const rootId = await ensureFolder(accessToken, 'FACTURES');
    const companyFolderId = await ensureFolder(accessToken, companyName, rootId);
    const yearFolderId = await ensureFolder(accessToken, year.toString(), companyFolderId);
    const monthFolderId = await ensureFolder(accessToken, monthFolder, yearFolderId);

    const metierFolder = gemini.metier
      ? gemini.metier.charAt(0).toUpperCase() + gemini.metier.slice(1).replace(/_/g, ' ')
      : 'Autre';
    const metierFolderId = await ensureFolder(accessToken, metierFolder, monthFolderId);

    const spreadsheetId = await getOrCreateYearlySheet(accessToken, year, yearFolderId);

    const ext = file.type === 'application/pdf' ? 'pdf' : file.type === 'image/png' ? 'png' : 'jpg';
    const fileName = `${gemini.doc_date}_${gemini.supplier_name}_${gemini.montant_ttc?.toFixed(2) || '0.00'}.${ext}`
      .replace(/[/\\?%*:|"<>]/g, '_');

    const arrayBuffer = await file.arrayBuffer();
    const driveFile = await uploadInvoiceToDrive(
      accessToken, new Uint8Array(arrayBuffer), fileName, metierFolderId, file.type
    );

    // 6. SUPABASE DB
    const currentYear = new Date().getFullYear();
    const needsReview = (gemini.confidence_score < 70) ||
      (gemini.doc_year !== null && gemini.doc_year < currentYear - 1) ||
      !validation.valid;

    const { data: invoice, error: insertError } = await supabase
      .from('invoices')
      .insert({
        user_id: userId,
        company_id: companyId,
        source: 'upload',
        file_url: driveFile.webViewLink,
        drive_link: driveFile.webViewLink,
        drive_file_id: driveFile.id,
        spreadsheet_id: spreadsheetId,
        document_type: gemini.document_type,
        cost_type: gemini.cost_type,
        metier: gemini.metier,
        nature_depense: gemini.nature_depense,
        doc_date: gemini.doc_date,
        doc_year: gemini.doc_year,
        date_echeance: gemini.date_echeance,
        supplier_name: gemini.supplier_name,
        supplier_siret: gemini.supplier_siret,
        doc_number: gemini.doc_number,
        montant_ht: gemini.montant_ht,
        taux_tva: gemini.taux_tva,
        montant_tva: gemini.montant_tva,
        montant_ttc: gemini.montant_ttc,
        autoliquidation: gemini.autoliquidation,
        payment_method: gemini.payment_method,
        supplier_iban: gemini.supplier_iban,
        summary: gemini.summary,
        confidence_score: gemini.confidence_score,
        status: needsReview ? 'review' : 'processed',
        manual_review: needsReview,
        review_reason: needsReview
          ? (!validation.valid ? 'Erreur validation montants' : gemini.confidence_score < 70 ? 'Confiance faible' : 'Date suspecte')
          : null,
      })
      .select()
      .single();

    if (insertError) return { success: false, error: `Erreur sauvegarde: ${insertError.message}` };

    // 6b. LINE ITEMS
    if (gemini.line_items && gemini.line_items.length > 0 && invoice) {
      const lineItems = gemini.line_items.map((li, idx) => ({
        invoice_id: invoice.id,
        line_number: idx + 1,
        description: li.description,
        quantity: li.quantity,
        unit: li.unit,
        unit_price_ht: li.unit_price_ht,
        total_ht: li.total_ht,
        taux_tva: li.taux_tva,
      }));
      await supabase.from('invoice_line_items').insert(lineItems);
    }

    // 6c. MATCH/CREATE SUPPLIER
    if (gemini.supplier_name) {
      const { data: existing } = await supabase
        .from('suppliers')
        .select('id')
        .eq('name', gemini.supplier_name)
        .single();

      if (existing) {
        await supabase.from('invoices').update({ supplier_id: existing.id }).eq('id', invoice!.id);
      } else {
        const { data: newSup } = await supabase
          .from('suppliers')
          .insert({
            name: gemini.supplier_name,
            display_name: gemini.supplier_name,
            siret: gemini.supplier_siret,
            is_sous_traitant: gemini.autoliquidation,
            default_metier: gemini.metier,
            default_nature: gemini.nature_depense,
            default_cost_type: gemini.cost_type,
          })
          .select('id')
          .single();
        if (newSup) {
          await supabase.from('invoices').update({ supplier_id: newSup.id }).eq('id', invoice!.id);
        }
      }
    }

    // 7. GOOGLE SHEETS
    try {
      await appendInvoiceToSheet(accessToken, spreadsheetId, {
        doc_date: gemini.doc_date,
        supplier_name: gemini.supplier_name,
        supplier_siret: gemini.supplier_siret,
        metier: gemini.metier,
        nature_depense: gemini.nature_depense,
        cost_type: gemini.cost_type,
        doc_number: gemini.doc_number,
        montant_ht: gemini.montant_ht,
        montant_tva: gemini.montant_tva,
        montant_ttc: gemini.montant_ttc,
        taux_tva: gemini.taux_tva,
        summary: gemini.summary,
        drive_link: driveFile.webViewLink,
      });
    } catch (e) {
      warnings.push('Échec sync Google Sheets (facture sauvegardée quand même)');
    }

    return { success: true, invoice: invoice as Invoice, warnings: warnings.length ? warnings : undefined };

  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
  }
}
