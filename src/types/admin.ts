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

export type ReportPeriodKind = 'weekly' | 'monthly';
export type ReportDeliveryStatus = 'sent' | 'failed';

export interface ReportDelivery {
  id: string;
  period_kind: ReportPeriodKind;
  period_start: string;
  period_end: string;
  status: ReportDeliveryStatus;
  error: string | null;
  sent_at: string;
  email_to: string;
  invoices_count: number;
}
