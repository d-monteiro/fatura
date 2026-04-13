/**
 * FaturaAI - Billing & Stripe Types
 */

export interface StripeCheckoutRequest {
  plan_slug: string;
  billing_cycle: 'monthly' | 'yearly';
  onboarding_submission_id?: string;
}

export interface StripeCheckoutResponse {
  checkout_url: string;
  session_id: string;
}

export interface BillingInfo {
  plan_name: string;
  plan_slug: string;
  plan_status: string;
  billing_cycle: 'monthly' | 'yearly';
  current_period_end: string | null;
  trial_ends_at: string | null;
  invoices_used: number;
  invoices_limit: number | null;
  cancel_at_period_end: boolean;
}

export interface StripeInvoice {
  id: string;
  amount_paid: number;
  currency: string;
  status: string;
  created: number;
  invoice_pdf: string | null;
}
