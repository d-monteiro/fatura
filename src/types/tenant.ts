/**
 * FaturaAI - Multi-Tenant Types
 */

export type PlanSlug = 'starter' | 'pro' | 'entreprise';
export type PlanStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'paused' | 'pending_contact';
export type SetupStatus = 'pending' | 'provisioning' | 'ready' | 'error';
export type TenantRole = 'owner' | 'admin' | 'member' | 'readonly';
export type StorageProvider = 'google_drive' | 'onedrive';
export type FolderStructure = 'year_type' | 'year_supplier' | 'year_month';
export type AutoReports = 'never' | 'weekly' | 'monthly';

export interface Plan {
  id: string;
  created_at: string;
  name: string;
  slug: PlanSlug;

  // Pricing (cents)
  price_monthly: number | null;
  price_yearly: number | null;
  stripe_price_id_monthly: string | null;
  stripe_price_id_yearly: string | null;
  setup_fee: number;
  stripe_setup_price_id: string | null;
  is_custom_pricing: boolean;

  // Limits
  max_invoices_month: number | null;
  max_users: number | null;
  max_companies: number | null;

  // Feature flags
  has_dashboard: boolean;
  has_drive_storage: boolean;
  has_manual_upload: boolean;
  has_email_sync: boolean;
  has_auto_sheets: boolean;
  has_reports: boolean;
  has_api_access: boolean;
  has_multi_user: boolean;
  has_priority_support: boolean;
  has_custom_branding: boolean;
  has_custom_domain: boolean;
  has_dedicated_account: boolean;

  // Display
  description: string | null;
  features_list: string[] | null;
  is_popular: boolean;
  cta_label: string;
  sort_order: number;
  is_active: boolean;
}

export interface Tenant {
  id: string;
  created_at: string;
  updated_at: string;

  // Identity
  name: string;
  slug: string;
  nif: string | null;
  sector: string | null;
  country: string;

  // Branding
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;

  // Billing
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  plan_id: string | null;
  plan_status: PlanStatus;
  trial_ends_at: string | null;

  // Usage
  invoices_this_month: number;
  invoices_month_reset: string | null;

  // Onboarding
  onboarding_completed: boolean;
  onboarding_data: Record<string, unknown> | null;
  setup_status: SetupStatus;
  setup_error: string | null;

  // AI Config
  ai_prompt_config: Record<string, unknown> | null;
  invoice_name_variations: string[] | null;

  // Settings
  currency: string;
  date_format: string;
  language: string;
  timezone: string;

  // Storage config
  storage_provider: StorageProvider;
  folder_structure: FolderStructure;
  auto_sheets: boolean;
  sheet_columns: Record<string, unknown> | null;

  // Dashboard config
  dashboard_widgets: Record<string, unknown> | null;
  auto_reports: AutoReports;
  report_email: string | null;

  // Status
  is_active: boolean;
  deleted_at: string | null;

  // Metadata
  referred_by: string | null;
  notes: string | null;
}

export interface TenantUser {
  id: string;
  created_at: string;
  tenant_id: string;
  user_id: string;
  role: TenantRole;
  invited_by: string | null;
  invited_at: string | null;
  accepted_at: string | null;
  is_active: boolean;
}

export interface OnboardingSubmission {
  id: string;
  created_at: string;
  tenant_id: string | null;
  user_id: string | null;
  email: string;
  status: 'draft' | 'submitted' | 'processing' | 'completed' | 'failed';
  current_step: number;

  block_company: Record<string, unknown> | null;
  block_invoice_intel: Record<string, unknown> | null;
  block_storage: Record<string, unknown> | null;
  block_dashboard: Record<string, unknown> | null;
  block_automation: Record<string, unknown> | null;

  sample_invoices: string[] | null;
  logo_url: string | null;

  selected_plan: PlanSlug | null;
  billing_cycle: 'monthly' | 'yearly';

  provisioning_started_at: string | null;
  provisioning_completed_at: string | null;
  provisioning_error: string | null;

  stripe_checkout_session_id: string | null;
  payment_completed: boolean;
}
