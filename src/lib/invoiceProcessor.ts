// Barrel: split do antigo invoiceProcessor.ts (355 LOC) em
// invoiceProcessor/{tenant,dedup,upload,persist}.ts orquestrado por ./index.
// API pública mantém-se inalterada para os callers.

export { processInvoiceUpload } from './invoiceProcessor/index';
export type { UploadResult } from './invoiceProcessor/index';
