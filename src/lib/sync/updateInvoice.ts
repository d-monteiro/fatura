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
  | 'valor_sem_iva' | 'valor_iva' | 'valor_total' | 'taxa_iva'
  | 'category' | 'summary'
>>;

export interface UpdateInvoiceResult {
  success: boolean;
  sheetsSynced: boolean;
  warning?: string;
  error?: string;
  invoice?: Invoice;
}

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
      valor_total: invoice.valor_total,
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
  if (patch.category !== undefined) out.category = patch.category;
  if (patch.doc_number !== undefined) out.doc_number = patch.doc_number;
  if (patch.valor_sem_iva !== undefined) out.valor_sem_iva = patch.valor_sem_iva;
  if (patch.valor_iva !== undefined) out.valor_iva = patch.valor_iva;
  if (patch.valor_total !== undefined) out.valor_total = patch.valor_total;
  if (patch.taxa_iva !== undefined) out.taxa_iva = patch.taxa_iva;
  if (patch.summary !== undefined) out.summary = patch.summary;
  return out;
}
