// FaturaAI — tipos da BD. Multi-tenant, multi-empresa, line items.
// Nota: algumas colunas SQL mantêm nomes herdados (montant_ht, taux_tva, etc.).
// Renomear exige migration — ver CLAUDE.md dívida técnica.

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
export type DocumentType = 'facture' | 'avoir' | 'recu' | 'autre';
export type CostType = 'cout_fixe' | 'cout_variable';
export type InvoiceStatus = 'pending' | 'analyzing' | 'inbox' | 'processed' | 'review' | 'failed';

export type Metier =
  | 'electricite'
  | 'plomberie'
  | 'chauffage'
  | 'platrerie'
  | 'autre';

export type NatureDepense =
  | 'materiaux'
  | 'sous_traitants'
  | 'location_materiel'
  | 'restauration'
  | 'carburant'
  | 'atelier'
  | 'assurances'
  | 'comptabilite'
  | 'fournitures_bureau'
  | 'autre';

export interface Invoice {
  id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  tenant_id: string;
  user_id: string | null;
  company_id: string;

  // SOURCE
  source: 'upload' | 'email' | 'photo';
  email_message_id: string | null;  // Gmail message ID (dedup)
  email_attachment_id: string | null; // Gmail attachment ID (dedup por anexo)

  // STORAGE
  file_url: string;
  storage_path: string | null;

  // GOOGLE DRIVE
  drive_link: string | null;
  drive_file_id: string | null;

  // AI EXTRACTED DATA
  document_type: DocumentType | null;
  cost_type: CostType | null;
  metier: Metier | null;
  nature_depense: NatureDepense | null;

  doc_date: string | null;        // YYYY-MM-DD
  doc_year: number | null;
  date_echeance: string | null;   // data vencimento

  supplier_name: string | null;   // MAIÚSCULAS
  supplier_nif: string | null;
  supplier_id: string | null;     // FK suppliers (após matching)

  doc_number: string | null;

  // Valores monetários (colunas herdadas com nomes FR)
  montant_ht: number | null;      // valor sem IVA
  taux_tva: number | null;        // taxa IVA: 23, 13, 6, 0
  montant_tva: number | null;     // montante IVA
  montant_ttc: number | null;     // valor com IVA
  autoliquidation: boolean;       // autoliquidação IVA (subempreiteiro)

  payment_method: string | null;
  supplier_iban: string | null;

  summary: string | null;         // máx. 5 palavras
  confidence_score: number | null;

  status: InvoiceStatus;
  manual_review: boolean;
  review_reason: string | null;

  // SPREADSHEET
  spreadsheet_id: string | null;

  // DEDUP
  attachment_hash: string | null;  // SHA-256 hex do binário original; unique por (tenant_id, attachment_hash)
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
  unit: string | null;           // m2, ml, un, h, kg, etc.
  unit_price_ht: number | null;
  total_ht: number | null;
  taux_tva: number | null;
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
// CATEGORIES
// ==========================================
export type CategoryAxis = 'cost_type' | 'metier' | 'nature_depense';

export interface Category {
  id: string;
  tenant_id: string;
  axis: CategoryAxis;
  code: string;
  label: string;
  sort_order: number;
  is_active: boolean;
}

// ==========================================
// EMAIL ACCOUNTS
// ==========================================
export interface EmailAccount {
  id: string;
  created_at: string;
  tenant_id: string;
  user_id: string;
  email: string;                 // Gmail address
  provider: 'gmail';
  oauth_token_id: string | null; // FK user_oauth_tokens
  last_sync_at: string | null;
  last_history_id: string | null; // Gmail history ID
  is_active: boolean;
  company_id: string | null;     // Default company for invoices from this email
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
  rejection_reason: 'pas_un_document' | 'document_illisible' | 'pas_une_facture' | null;

  document_type: DocumentType | null;
  cost_type: CostType | null;
  metier: Metier | null;
  nature_depense: NatureDepense | null;

  doc_year: number | null;
  doc_date: string | null;
  date_echeance: string | null;

  supplier_name: string | null;
  supplier_nif: string | null;
  doc_number: string | null;
  destinataire_name: string | null;

  montant_ht: number | null;
  taux_tva: number | null;
  montant_tva: number | null;
  montant_ttc: number | null;
  autoliquidation: boolean;

  payment_method: string | null;
  supplier_iban: string | null;

  summary: string | null;
  confidence_score: number;

  line_items: {
    description: string | null;
    quantity: number | null;
    unit: string | null;
    unit_price_ht: number | null;
    total_ht: number | null;
    taux_tva: number | null;
  }[];
}
