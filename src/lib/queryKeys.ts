import type { QueryClient } from '@tanstack/react-query';

export const queryKeys = {
  faturas: ['faturas'] as const,
  faturasList: (...args: unknown[]) => ['faturas', ...args] as const,
  inboxInvoices: ['inbox-invoices'] as const,
  inboxByCompany: (companyId: string | null) => ['inbox-invoices', companyId] as const,
  dashboardMetrics: ['dashboard-metrics'] as const,
  dashboardByCompany: (companyId: string | null) => ['dashboard-metrics', companyId] as const,
  recentInvoices: ['recent-invoices'] as const,
  recentByCompany: (companyId: string | null) => ['recent-invoices', companyId] as const,
  suppliers: ['suppliers'] as const,
  suppliersSearch: (search: string) => ['suppliers', search] as const,
  companies: ['companies'] as const,
  emailAccounts: ['email-accounts'] as const,
  oauthTokens: ['oauth-tokens'] as const,
  lineItems: (invoiceId: string) => ['line-items', invoiceId] as const,
  company: (companyId: string) => ['company', companyId] as const,
};

const INVOICE_LIST_KEYS = [
  queryKeys.faturas,
  queryKeys.inboxInvoices,
  queryKeys.dashboardMetrics,
  queryKeys.recentInvoices,
];

export function invalidateInvoiceLists(qc: QueryClient): void {
  INVOICE_LIST_KEYS.forEach((key) => qc.invalidateQueries({ queryKey: key }));
}
