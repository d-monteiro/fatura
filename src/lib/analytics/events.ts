export const EVENTS = {
  // Onboarding funnel
  ONBOARDING_STARTED: 'onboarding_started',
  ONBOARDING_STEP_VIEWED: 'onboarding_step_viewed',
  ONBOARDING_STEP_COMPLETED: 'onboarding_step_completed',
  ONBOARDING_STEP_ABANDONED: 'onboarding_step_abandoned',
  ONBOARDING_SUBMITTED: 'onboarding_submitted',
  ONBOARDING_ENTERPRISE_CONTACT_SUBMITTED: 'onboarding_enterprise_contact_submitted',

  // Auth
  SIGNUP_STARTED: 'signup_started',
  SIGNUP_COMPLETED: 'signup_completed',
  LOGIN_COMPLETED: 'login_completed',
  LOGOUT: 'logout',

  // Invoices
  INVOICE_UPLOAD_STARTED: 'invoice_upload_started',
  INVOICE_UPLOAD_COMPLETED: 'invoice_upload_completed',
  INVOICE_ANALYZE_SUCCEEDED: 'invoice_analyze_succeeded',
  INVOICE_ANALYZE_FAILED: 'invoice_analyze_failed',
  INVOICE_SAVED: 'invoice_saved',
  INVOICE_DUPLICATE_BLOCKED: 'invoice_duplicate_blocked',

  // OAuth Google
  GOOGLE_OAUTH_INITIATED: 'google_oauth_initiated',
  GOOGLE_OAUTH_COMPLETED: 'google_oauth_completed',
  GOOGLE_OAUTH_FAILED: 'google_oauth_failed',

  // Product actions
  EXPORT_TO_SHEETS: 'export_to_sheets',
  COMPANY_ADDED: 'company_added',
  SUPPLIER_CREATED: 'supplier_created',
  PLAN_CHANGED: 'plan_changed',

  // Landing
  LANDING_CTA_CLICKED: 'landing_cta_clicked',
  LANDING_FAQ_EXPANDED: 'landing_faq_expanded',
  LANDING_PRICING_CYCLE_CHANGED: 'landing_pricing_cycle_changed',
} as const;

export const ONBOARDING_STEP_NAMES: Record<number, string> = {
  1: 'company',
  2: 'invoice_intel',
  3: 'storage',
  4: 'dashboard',
  5: 'automation',
  6: 'review',
  7: 'payment',
};

export type EventName = typeof EVENTS[keyof typeof EVENTS];
