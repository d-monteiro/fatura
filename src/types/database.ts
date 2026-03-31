/**
 * FaturaAI - LGM
 * Types base de dados. Multi-empresa, campos FR, line items.
 */

// ==========================================
// COMPANIES
// ==========================================
export interface Company {
  id: string;
  created_at: string;
  name: string;               // "LGM", "Holding", "Imobiliária"
  short_name: string;          // "LGM", "HOLD", "IMMO"
  siret: string | null;        // SIRET 14 digits
  siren: string | null;        // SIREN 9 digits
  address: string | null;
  tva_intracom: string | null; // FR + 2 digits + SIREN
  is_active: boolean;
  email: string | null;        // Gmail associado a esta empresa
  oauth_token_id: string | null; // FK user_oauth_tokens
  is_default: boolean;         // Empresa predefinida (LGM)
}

// ==========================================
// INVOICES (FACTURES)
// ==========================================
export type DocumentType = 'facture' | 'avoir' | 'recu' | 'autre';
export type CostType = 'cout_fixe' | 'cout_variable';
export type InvoiceStatus = 'pending' | 'inbox' | 'processed' | 'review';

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
  deleted_at: string | null;    // Soft delete
  user_id: string | null;
  company_id: string;           // FK companies

  // SOURCE
  source: 'upload' | 'email' | 'photo';
  email_message_id: string | null;  // Gmail message ID (dedup)

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
  date_echeance: string | null;   // Date échéance (due date)

  supplier_name: string | null;   // MAJUSCULES
  supplier_siret: string | null;
  supplier_id: string | null;     // FK suppliers (after matching)

  doc_number: string | null;

  // MONTANTS (French accounting)
  montant_ht: number | null;      // Hors Taxes
  taux_tva: number | null;        // 20, 10, 5.5, 2.1, 0
  montant_tva: number | null;     // TVA amount
  montant_ttc: number | null;     // Toutes Taxes Comprises
  autoliquidation: boolean;       // Sous-traitant reverse charge

  payment_method: string | null;  // CB, virement, cheque, especes
  supplier_iban: string | null;

  summary: string | null;         // Max 5 mots
  confidence_score: number | null;

  // QUALITY CONTROL
  status: InvoiceStatus;
  manual_review: boolean;
  review_reason: string | null;   // Why flagged for review

  // SPREADSHEET
  spreadsheet_id: string | null;
}

// ==========================================
// LINE ITEMS (LIGNES DE FACTURE)
// ==========================================
export interface InvoiceLineItem {
  id: string;
  created_at: string;
  invoice_id: string;            // FK invoices
  line_number: number;
  description: string | null;
  quantity: number | null;
  unit: string | null;           // m2, ml, u, forfait, h, kg, etc.
  unit_price_ht: number | null;
  total_ht: number | null;
  taux_tva: number | null;
}

// ==========================================
// SUPPLIERS (FOURNISSEURS)
// ==========================================
export interface Supplier {
  id: string;
  created_at: string;
  updated_at: string;
  name: string;                   // MAJUSCULES normalized
  display_name: string | null;    // Original name
  siret: string | null;
  siren: string | null;
  tva_intracom: string | null;
  address: string | null;
  iban: string | null;
  default_metier: Metier | null;
  default_nature: NatureDepense | null;
  default_cost_type: CostType | null;
  invoice_count: number;
  total_spent: number;
  is_sous_traitant: boolean;      // Auto-liquidation applies
}

// ==========================================
// CATEGORIES
// ==========================================
export type CategoryAxis = 'metier' | 'type_cout' | 'nature_depense';

export interface Category {
  id: string;
  company_id: string | null;     // null = shared across all
  axis: CategoryAxis;
  code: string;                  // electricite, cout_fixe, materiaux
  label_fr: string;              // Électricité
  label_pt: string;              // Eletricidade
  sort_order: number;
  is_active: boolean;
}

// ==========================================
// EMAIL ACCOUNTS
// ==========================================
export interface EmailAccount {
  id: string;
  created_at: string;
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
  user_id: string;
  provider: string;
  access_token: string;
  refresh_token: string | null;
  token_expiry: string | null;
  scopes: string[] | null;
  email: string | null;
  is_primary_storage: boolean;
}

// ==========================================
// AUDIT LOG
// ==========================================
export type AuditAction = 'create' | 'update' | 'delete' | 'restore' | 'review' | 'approve';

export interface AuditLog {
  id: string;
  created_at: string;
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
  supplier_siret: string | null;
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
