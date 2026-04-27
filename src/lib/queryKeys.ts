import type { QueryClient } from '@tanstack/react-query';

export const queryKeys = {
  faturas: ['faturas'] as const,
  faturasList: (...args: unknown[]) => ['faturas', ...args] as const,
  invoiceTabCounts: (tenantId: string | null, companyId: string | null) =>
    ['faturas', 'tab-counts', tenantId, companyId] as const,
  invoicesUsage: (tenantId: string | null) => ['faturas', 'usage', tenantId] as const,
  dashboardMetrics: ['dashboard-metrics'] as const,
  dashboardByCompany: (companyId: string | null) => ['dashboard-metrics', companyId] as const,
  recentInvoices: ['recent-invoices'] as const,
  recentByCompany: (companyId: string | null) => ['recent-invoices', companyId] as const,
  suppliers: ['suppliers'] as const,
  suppliersSearch: (search: string) => ['suppliers', search] as const,
  suppliersList: (tenantId: string | null) => ['suppliers', 'list', tenantId] as const,
  companies: ['companies'] as const,
  emailAccounts: ['email-accounts'] as const,
  oauthTokens: ['oauth-tokens'] as const,
  tickets: ['tickets'] as const,
  lineItems: (invoiceId: string) => ['line-items', invoiceId] as const,
  company: (companyId: string) => ['company', companyId] as const,
  syncRuns: ['sync-runs'] as const,
  syncRunsLatest: (tenantId: string | null) => ['sync-runs', 'latest', tenantId] as const,
  duplicates: (tenantId: string | null, companyId: string | null) =>
    ['duplicates', tenantId, companyId] as const,
  upcomingPayments: (tenantId: string | null, companyId: string | null) =>
    ['upcoming-payments', tenantId, companyId] as const,
  tenantMembers: (tenantId: string | null) => ['tenant-members', tenantId] as const,
  tenantInvites: (tenantId: string | null) => ['tenant-invites', tenantId] as const,
};

const INVOICE_LIST_KEYS = [
  queryKeys.faturas,
  queryKeys.dashboardMetrics,
  queryKeys.recentInvoices,
  ['duplicates'] as const,
  ['upcoming-payments'] as const,
];

export function invalidateInvoiceLists(qc: QueryClient): void {
  INVOICE_LIST_KEYS.forEach((key) => qc.invalidateQueries({ queryKey: key }));
}
