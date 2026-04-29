export interface TenantOverview {
  id: string;
  name: string;
  is_active: boolean;
  plan_status: string;
  invoices_total: number;
  invoices_this_month: number;
  suppliers_total: number;
  companies_total: number;
  slug?: string;
  country?: string;
  sector?: string | null;
  nif?: string | null;
  setup_status?: string;
  created_at?: string;
}

export type ReportPeriodKind = 'daily' | 'weekly' | 'monthly' | 'quarterly';
export type ReportDeliveryStatus = 'sent' | 'failed';

export interface ReportDelivery {
  id: string;
  config_id: string | null;
  period_kind: ReportPeriodKind;
  period_start: string;
  period_end: string;
  status: ReportDeliveryStatus;
  error: string | null;
  sent_at: string;
  email_to: string;
  invoices_count: number;
}

export interface ReportContentOptions {
  totals: boolean;
  top_suppliers: boolean;
  categories: boolean;
  alerts: boolean;
  top_expenses: boolean;
}

export interface ReportConfigFilters {
  companyIds?: string[] | null;
  categories?: string[] | null;
}

export interface ReportConfig {
  id: string;
  tenant_id: string;
  name: string;
  frequency: ReportPeriodKind;
  send_day: number;
  send_hour: number;
  recipients: string[];
  content_options: ReportContentOptions;
  filters: ReportConfigFilters;
  active: boolean;
  created_at: string;
  updated_at: string;
}
