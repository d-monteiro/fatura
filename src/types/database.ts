// FaturaAI — tipos da BD. Multi-tenant, multi-empresa, line items.
// Schema 100% PT (rename FR→PT em 2026-04-25). Categoria única substitui
// metier+nature_depense+cost_type — taxonomia gerida na tabela `categories`.

// ==========================================
// COMPANIES
// ==========================================
export interface Company {
  id: string;
  created_at: string;
  tenant_id: string;
  name: string;
  short_name: string;
  nif: string | null;
  address: string | null;
  is_active: boolean;
  email: string | null;
  oauth_token_id: string | null;
  is_default: boolean;
}

// ==========================================
// INVOICES (FATURAS)
// ==========================================
export type DocumentType = 'fatura' | 'nota_credito' | 'recibo' | 'outro';
export type InvoiceStatus = 'pending' | 'analyzing' | 'inbox' | 'processed' | 'review' | 'failed';
export type InvoiceSource = 'upload' | 'email' | 'photo';

export interface Invoice {
  id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  tenant_id: string;
  user_id: string | null;
  company_id: string;

  // ORIGEM
  source: InvoiceSource;
  email_message_id: string | null;
  email_attachment_id: string | null;
  email_subject: string | null;
  email_from: string | null;
  email_received_at: string | null;

  // STORAGE
  file_url: string;
  storage_path: string | null;

  // GOOGLE DRIVE
  drive_link: string | null;
  drive_file_id: string | null;

  // DADOS EXTRAÍDOS PELA IA
  document_type: DocumentType | null;
  category: string | null;        // FK lógica para categories.code (axis='category')

  doc_date: string | null;        // YYYY-MM-DD
  doc_year: number | null;
  data_vencimento: string | null; // data de vencimento

  supplier_name: string | null;   // MAIÚSCULAS
  supplier_nif: string | null;
  supplier_id: string | null;

  doc_number: string | null;

  // VALORES MONETÁRIOS
  valor_sem_iva: number | null;
  taxa_iva: number | null;        // 23, 13, 6, 0
  valor_iva: number | null;
  valor_total: number | null;
  autoliquidacao: boolean;        // autoliquidação IVA (subempreitada)

  payment_method: string | null;
  supplier_iban: string | null;

  summary: string | null;
  confidence_score: number | null;

  status: InvoiceStatus;
  manual_review: boolean;
  review_reason: string | null;
  destinatario_nome: string | null;

  // SHEET
  spreadsheet_id: string | null;

  // DEDUP
  attachment_hash: string | null;

  // PAGAMENTOS
  paid_at: string | null;
  payment_notified_at: string | null;
}

// ==========================================
// DUPLICADOS
// ==========================================
export interface DismissedDuplicate {
  id: string;
  created_at: string;
  tenant_id: string;
  invoice_a_id: string;
  invoice_b_id: string;
  dismissed_by: string | null;
}

export interface PotentialDuplicateRow {
  invoice_a_id: string;
  invoice_b_id: string;
  match_kind: 'doc_number' | 'amount_date';
  doc_number: string | null;
  supplier_name: string | null;
  supplier_id: string | null;
  company_id: string;
  valor_total: number | null;
  doc_date: string | null;
}

// ==========================================
// SYNC RUNS
// ==========================================
export type SyncRunStatus = 'running' | 'done' | 'error';
export type SyncRunTrigger = 'cron' | 'manual' | 'admin';

export interface SyncRun {
  id: string;
  tenant_id: string;
  user_id: string | null;
  trigger: SyncRunTrigger;
  status: SyncRunStatus;
  started_at: string;
  updated_at: string;
  completed_at: string | null;
  total_messages: number;
  total_discovered: number;
  total_duplicates: number;
  total_rejected: number;
  total_skipped: number;
  total_errors: number;
  error_message: string | null;
}

// ==========================================
// LINHAS DE FATURA
// ==========================================
export interface InvoiceLineItem {
  id: string;
  created_at: string;
  tenant_id: string;
  invoice_id: string;
  line_number: number;
  description: string | null;
  quantity: number | null;
  unit: string | null;
  preco_unitario: number | null;
  total_sem_iva: number | null;
  taxa_iva: number | null;
}

// ==========================================
// FORNECEDORES
// ==========================================
export interface Supplier {
  id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  tenant_id: string;
  name: string;
  display_name: string | null;
  nif: string | null;
  name_variations: string[];
  address: string | null;
  iban: string | null;
  invoice_count: number;
  total_spent: number;
  is_subcontractor: boolean;
}

// ==========================================
// CATEGORIES — taxonomia única customizável por tenant
// ==========================================
export type CategoryAxis = 'category';

export interface Category {
  id: string;
  tenant_id: string | null;
  axis: CategoryAxis;
  code: string;
  label: string;
  sort_order: number;
  is_active: boolean;
  is_fixed: boolean; // true = custo fixo (renda, seguros) — substitui o antigo cost_type
}

// ==========================================
// EMAIL ACCOUNTS
// ==========================================
export interface EmailAccount {
  id: string;
  created_at: string;
  tenant_id: string;
  user_id: string;
  email: string;
  provider: 'gmail';
  oauth_token_id: string | null;
  last_sync_at: string | null;
  last_history_id: string | null;
  is_active: boolean;
  company_id: string | null;
}

// ==========================================
// OAUTH TOKENS
// ==========================================
export interface OAuthToken {
  id: string;
  created_at: string;
  updated_at: string;
  tenant_id: string;
  user_id: string;
  provider: string;
  access_token: string;
  refresh_token: string | null;
  token_expiry: string | null;
  scopes: string[] | null;
  email: string | null;
  is_primary_storage: boolean;
  needs_reauth: boolean;
  reauth_reason: string | null;
  reauth_flagged_at: string | null;
}

// ==========================================
// AUDIT LOG
// ==========================================
export type AuditAction = 'create' | 'update' | 'delete' | 'restore' | 'review' | 'approve';

export interface AuditLog {
  id: string;
  created_at: string;
  tenant_id: string | null;
  user_id: string | null;
  table_name: string;
  record_id: string;
  action: AuditAction;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
}

// ==========================================
// GEMINI RESPONSE
// ==========================================
export interface GeminiInvoiceData {
  is_valid_document: boolean;
  rejection_reason: 'nao_e_documento' | 'documento_ilegivel' | 'nao_e_fatura' | 'fatura_propria' | null;

  document_type: DocumentType | null;
  category: string | null;

  doc_year: number | null;
  doc_date: string | null;
  data_vencimento: string | null;

  supplier_name: string | null;
  supplier_nif: string | null;
  doc_number: string | null;
  destinatario_nome: string | null;

  valor_sem_iva: number | null;
  taxa_iva: number | null;
  valor_iva: number | null;
  valor_total: number | null;
  autoliquidacao: boolean;

  payment_method: string | null;
  supplier_iban: string | null;

  summary: string | null;
  confidence_score: number;

  line_items: {
    description: string | null;
    quantity: number | null;
    unit: string | null;
    preco_unitario: number | null;
    total_sem_iva: number | null;
    taxa_iva: number | null;
  }[];
}
