// Orquestrador de edições: Supabase como fonte da verdade + tentativa de sync ao Sheets.
// Partial failure: se Sheets falhar, a edição fica persistida e é reportado warning.
//
// Sync v2 (PLAN_FASE3 1.5.2): quando `doc_date` muda de mês ou de ano, a linha
// é limpa da aba antiga e re-inserida na aba correcta. Operação não-atómica:
// se o append falhar a meio, retornamos warning e o utilizador vê duas linhas
// (uma vazia + uma nova). É o trade-off aceite porque a alternativa (delete
// real) reorganiza linhas e quebra outros editores em concorrência.
//
// Sync v3 (G4): a aba "ANO" é mantida em paralelo. Cada append em
// `appendInvoiceToSheet` já cobre month tab + ANO. Em edição in-place o ANO
// recebe um update separado por `findInvoiceRowIndex` em ANO. Quando muda de
// mês, a row velha em ANO é limpa (a nova já entrou pelo append).

import { supabase } from '@/lib/supabase/client';
import {
  findInvoiceRowIndex,
  updateInvoiceRowInSheet,
  clearInvoiceRowInSheet,
  appendInvoiceToSheet,
  getMonthSheetName,
  YEAR_SHEET_NAME,
  type InvoiceRowUpdates,
} from '@/lib/google/sheets';
import { reportError } from '@/lib/errors/errorReporter';
import type { Invoice } from '@/types/database';

export type InvoicePatch = Partial<Pick<Invoice,
  | 'supplier_name' | 'supplier_nif' | 'doc_number' | 'doc_date'
  | 'valor_sem_iva' | 'valor_iva' | 'valor_total' | 'taxa_iva'
  | 'category' | 'summary' | 'is_fixed'
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

  if (!invoice.spreadsheet_id) return { success: true, sheetsSynced: false, invoice: updated as Invoice };
  if (!accessToken) {
    return {
      success: true, sheetsSynced: false, invoice: updated as Invoice,
      warning: 'Ligação Google em falta — Sheets não sincronizado.',
    };
  }

  const oldSheetName = sheetNameForDate(invoice.doc_date, language);
  const newSheetName = updates.doc_date !== undefined
    ? sheetNameForDate(updates.doc_date, language)
    : oldSheetName;
  const tabChanged = newSheetName !== oldSheetName;

  const monthResult = await syncMonthTab({
    accessToken,
    spreadsheetId: invoice.spreadsheet_id,
    invoice,
    updated: updated as Invoice,
    updates,
    oldSheetName,
    newSheetName,
    tabChanged,
    language,
  });

  // ANO sync best-effort. Não altera o resultado; só logamos warnings.
  if (monthResult.attemptYearSync) {
    try {
      await syncYearTab({
        accessToken,
        spreadsheetId: invoice.spreadsheet_id,
        invoice,
        updates,
        tabChanged,
      });
    } catch (err) {
      void reportError(err, {
        component: 'sync/updateInvoiceEverywhere/syncYearTab',
        tenantId: invoice.tenant_id,
        level: 'warn',
        extra: { invoiceId: invoice.id, spreadsheetId: invoice.spreadsheet_id },
      });
    }
  }

  return monthResult.result;
}

interface MonthSyncOutcome {
  result: UpdateInvoiceResult;
  // Só tentamos ANO se o month sync teve sucesso (consistência).
  attemptYearSync: boolean;
}

async function syncMonthTab(args: {
  accessToken: string;
  spreadsheetId: string;
  invoice: Invoice;
  updated: Invoice;
  updates: InvoicePatch;
  oldSheetName: string;
  newSheetName: string;
  tabChanged: boolean;
  language: string;
}): Promise<MonthSyncOutcome> {
  const { accessToken, spreadsheetId, invoice, updated, updates, oldSheetName, newSheetName, tabChanged, language } = args;

  try {
    const rowIndex = await findInvoiceRowIndex(accessToken, spreadsheetId, oldSheetName, {
      doc_number: invoice.doc_number,
      supplier_name: invoice.supplier_name,
      valor_total: invoice.valor_total,
      doc_date: invoice.doc_date,
    });

    if (!rowIndex) {
      // Pode ter sido removida manualmente. Se mudou de mês, ainda assim
      // damos uma chance: anexamos à nova aba para restaurar a presença.
      if (tabChanged) {
        await appendUpdatedRow(accessToken, spreadsheetId, updated, language);
        return {
          result: {
            success: true, sheetsSynced: true, invoice: updated,
            warning: 'Linha original não encontrada na aba antiga — adicionada na nova.',
          },
          attemptYearSync: true,
        };
      }
      return {
        result: {
          success: true, sheetsSynced: false, invoice: updated,
          warning: 'Linha não encontrada no Sheets (pode ter sido removida manualmente).',
        },
        attemptYearSync: false,
      };
    }

    if (tabChanged) {
      const cleared = await clearInvoiceRowInSheet(accessToken, spreadsheetId, oldSheetName, rowIndex);
      if (!cleared) {
        return {
          result: {
            success: true, sheetsSynced: false, invoice: updated,
            warning: 'Falhou a limpar linha antiga no Sheets — não movido (edita manualmente).',
          },
          attemptYearSync: false,
        };
      }
      try {
        await appendUpdatedRow(accessToken, spreadsheetId, updated, language);
      } catch (appendErr) {
        void reportError(appendErr, {
          component: 'sync/updateInvoiceEverywhere/appendAfterClear',
          tenantId: invoice.tenant_id,
          level: 'warn',
          extra: { invoiceId: invoice.id, oldSheetName, newSheetName },
        });
        return {
          result: {
            success: true, sheetsSynced: false, invoice: updated,
            warning: 'Linha removida da aba antiga mas falhou append na nova. Revê manualmente.',
          },
          attemptYearSync: false,
        };
      }
      return {
        result: { success: true, sheetsSynced: true, invoice: updated },
        attemptYearSync: true,
      };
    }

    const sheetUpdates = mapPatchToSheetRow(updates);
    const ok = await updateInvoiceRowInSheet(accessToken, spreadsheetId, oldSheetName, rowIndex, sheetUpdates);
    if (!ok) {
      return {
        result: {
          success: true, sheetsSynced: false, invoice: updated,
          warning: 'Sheets rejeitou a atualização — tente novamente ou edite manualmente.',
        },
        attemptYearSync: false,
      };
    }
    return {
      result: { success: true, sheetsSynced: true, invoice: updated },
      attemptYearSync: true,
    };
  } catch (err) {
    void reportError(err, {
      component: 'sync/updateInvoiceEverywhere/syncMonthTab',
      tenantId: invoice.tenant_id,
      level: 'warn',
      extra: { invoiceId: invoice.id, spreadsheetId },
    });
    return {
      result: {
        success: true, sheetsSynced: false, invoice: updated,
        warning: 'Falha na sincronização com Google Sheets (fatura guardada).',
      },
      attemptYearSync: false,
    };
  }
}

// Sincroniza a aba ANO com base no estado pré-edição (criteria) → row a tocar.
//
// - `tabChanged` (mês alterado): a row nova já entrou na ANO via
//   appendInvoiceToSheet (chamado pelo month sync). Só limpamos a row velha.
// - !tabChanged: update in-place na ANO usando o mesmo patch.
//
// Se a row velha não for encontrada na ANO, é benigno (pode ter sido apagada
// manualmente ou nunca ter sido sincronizada).
async function syncYearTab(args: {
  accessToken: string;
  spreadsheetId: string;
  invoice: Invoice;
  updates: InvoicePatch;
  tabChanged: boolean;
}): Promise<void> {
  const { accessToken, spreadsheetId, invoice, updates, tabChanged } = args;

  const oldRow = await findInvoiceRowIndex(accessToken, spreadsheetId, YEAR_SHEET_NAME, {
    doc_number: invoice.doc_number,
    supplier_name: invoice.supplier_name,
    valor_total: invoice.valor_total,
    doc_date: invoice.doc_date,
  });

  if (tabChanged) {
    if (oldRow) {
      await clearInvoiceRowInSheet(accessToken, spreadsheetId, YEAR_SHEET_NAME, oldRow);
    }
    return;
  }

  if (!oldRow) return;
  const sheetUpdates = mapPatchToSheetRow(updates);
  if (Object.keys(sheetUpdates).length === 0) return;
  await updateInvoiceRowInSheet(accessToken, spreadsheetId, YEAR_SHEET_NAME, oldRow, sheetUpdates);
}

async function appendUpdatedRow(
  accessToken: string,
  spreadsheetId: string,
  inv: Invoice,
  language: string,
): Promise<void> {
  await appendInvoiceToSheet(accessToken, spreadsheetId, {
    doc_date: inv.doc_date,
    supplier_name: inv.supplier_name,
    supplier_nif: inv.supplier_nif,
    category: inv.category,
    doc_number: inv.doc_number,
    valor_sem_iva: inv.valor_sem_iva,
    valor_iva: inv.valor_iva,
    valor_total: inv.valor_total,
    taxa_iva: inv.taxa_iva,
    summary: inv.summary,
    drive_link: inv.drive_link ?? inv.file_url,
  }, language);
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
