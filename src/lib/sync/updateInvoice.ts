// Orquestrador de edições: Supabase como fonte da verdade + tentativa de sync ao Sheets.
// Partial failure: se Sheets falhar, a edição fica persistida e é reportado warning.

import { supabase } from '@/lib/supabase/client';
import {
  findInvoiceRowIndex,
  updateInvoiceRowInSheet,
  getMonthSheetName,
  type InvoiceRowUpdates,
} from '@/lib/google/sheets';
import { reportError } from '@/lib/errors/errorReporter';
import type { Invoice } from '@/types/database';

export type InvoicePatch = Partial<Pick<Invoice,
  | 'supplier_name' | 'supplier_nif' | 'doc_number' | 'doc_date'
  | 'montant_ht' | 'montant_tva' | 'montant_ttc' | 'taux_tva'
  | 'metier' | 'nature_depense' | 'cost_type' | 'summary'
>>;

export interface UpdateInvoiceResult {
  success: boolean;
  sheetsSynced: boolean;
  warning?: string;
  error?: string;
  invoice?: Invoice;
}

/**
 * Edita fatura em Supabase e propaga ao Google Sheets em best-effort.
 * Supabase é fonte da verdade; falha no Sheets → warning, não bloqueia.
 */
export async function updateInvoiceEverywhere(input: {
  invoice: Invoice;
  updates: InvoicePatch;
  accessToken: string | null;
  language?: string;
}): Promise<UpdateInvoiceResult> {
  const { invoice, updates, accessToken, language = 'pt' } = input;

  const { data: updated, error } = await supabase.from('invoices')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', invoice.id).select().single();

  if (error || !updated) {
    return { success: false, sheetsSynced: false, error: error?.message ?? 'Erro a guardar fatura.' };
  }

  const hasSheet = !!invoice.spreadsheet_id;
  if (!hasSheet) return { success: true, sheetsSynced: false, invoice: updated as Invoice };
  if (!accessToken) {
    return {
      success: true, sheetsSynced: false, invoice: updated as Invoice,
      warning: 'Ligação Google em falta — Sheets não sincronizado.',
    };
  }

  const sheetName = sheetNameForDate(invoice.doc_date, language);
  const dateChangedMonth = !!updates.doc_date && sheetName !== sheetNameForDate(updates.doc_date, language);

  try {
    const rowIndex = await findInvoiceRowIndex(accessToken, invoice.spreadsheet_id!, sheetName, {
      doc_number: invoice.doc_number,
      supplier_name: invoice.supplier_name,
      montant_ttc: invoice.montant_ttc,
      doc_date: invoice.doc_date,
    });

    if (!rowIndex) {
      return {
        success: true, sheetsSynced: false, invoice: updated as Invoice,
        warning: 'Linha não encontrada no Sheets (pode ter sido removida manualmente).',
      };
    }

    const sheetUpdates: InvoiceRowUpdates = mapPatchToSheetRow(updates);
    const ok = await updateInvoiceRowInSheet(accessToken, invoice.spreadsheet_id!, sheetName, rowIndex, sheetUpdates);
    if (!ok) {
      return {
        success: true, sheetsSynced: false, invoice: updated as Invoice,
        warning: 'Sheets rejeitou a atualização — tente novamente ou edite manualmente.',
      };
    }

    if (dateChangedMonth) {
      return {
        success: true, sheetsSynced: true, invoice: updated as Invoice,
        warning: 'Data mudou de mês; linha permanece na aba antiga (mover manualmente).',
      };
    }

    return { success: true, sheetsSynced: true, invoice: updated as Invoice };
  } catch (err) {
    void reportError(err, {
      component: 'sync/updateInvoiceEverywhere',
      tenantId: invoice.tenant_id,
      level: 'warn',
      extra: { invoiceId: invoice.id, spreadsheetId: invoice.spreadsheet_id },
    });
    return {
      success: true, sheetsSynced: false, invoice: updated as Invoice,
      warning: 'Falha na sincronização com Google Sheets (fatura guardada).',
    };
  }
}

function sheetNameForDate(isoDate: string | null, language: string): string {
  if (!isoDate) return getMonthSheetName(0, language);
  const d = new Date(isoDate);
  const idx = isNaN(d.getTime()) ? 0 : d.getMonth();
  return getMonthSheetName(idx, language);
}

function mapPatchToSheetRow(patch: InvoicePatch): InvoiceRowUpdates {
  const out: InvoiceRowUpdates = {};
  if (patch.doc_date !== undefined) out.doc_date = patch.doc_date;
  if (patch.supplier_name !== undefined) out.supplier_name = patch.supplier_name;
  if (patch.supplier_nif !== undefined) out.supplier_nif = patch.supplier_nif;
  if (patch.metier !== undefined) out.metier = patch.metier;
  if (patch.nature_depense !== undefined) out.nature_depense = patch.nature_depense;
  if (patch.cost_type !== undefined) out.cost_type = patch.cost_type;
  if (patch.doc_number !== undefined) out.doc_number = patch.doc_number;
  if (patch.montant_ht !== undefined) out.montant_ht = patch.montant_ht;
  if (patch.montant_tva !== undefined) out.montant_tva = patch.montant_tva;
  if (patch.montant_ttc !== undefined) out.montant_ttc = patch.montant_ttc;
  if (patch.taux_tva !== undefined) out.taux_tva = patch.taux_tva;
  if (patch.summary !== undefined) out.summary = patch.summary;
  return out;
}
