// Barrel: split do antigo drive.ts (344 LOC) em drive/{client,folders,search,spreadsheets,upload}.ts.
// API pública mantém-se inalterada para os callers.

export { ensureFolder } from './drive/folders';
export { uploadInvoiceToDrive } from './drive/upload';
export { getOrCreateYearlySheet } from './drive/spreadsheets';
