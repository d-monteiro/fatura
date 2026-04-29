import type { Plan, PlanSlug } from '@/types/tenant';

const PLAN_RANK: Record<PlanSlug, number> = {
  starter: 1,
  pro: 2,
  entreprise: 3,
};

export type FeatureKey =
  | 'email_sync'
  | 'auto_sheets'
  | 'reports'
  | 'reports_custom'
  | 'api_access'
  | 'multi_user'
  | 'priority_support'
  | 'custom_branding'
  | 'custom_domain'
  | 'dedicated_account'
  | 'saft_export'
  | 'slack_alerts';

type PlanFlag = keyof Pick<
  Plan,
  | 'has_email_sync'
  | 'has_auto_sheets'
  | 'has_reports'
  | 'has_api_access'
  | 'has_multi_user'
  | 'has_priority_support'
  | 'has_custom_branding'
  | 'has_custom_domain'
  | 'has_dedicated_account'
>;

export interface FeatureSpec {
  minPlan: PlanSlug;
  planFlag?: PlanFlag;
  label: string;
}

export const FEATURES: Record<FeatureKey, FeatureSpec> = {
  email_sync: { minPlan: 'pro', planFlag: 'has_email_sync', label: 'Sincronização de email' },
  auto_sheets: { minPlan: 'pro', planFlag: 'has_auto_sheets', label: 'Google Sheets automático' },
  reports: { minPlan: 'starter', planFlag: 'has_reports', label: 'Relatórios automáticos' },
  reports_custom: { minPlan: 'pro', label: 'Relatórios personalizados' },
  api_access: { minPlan: 'entreprise', planFlag: 'has_api_access', label: 'Acesso à API' },
  multi_user: { minPlan: 'entreprise', planFlag: 'has_multi_user', label: 'Convidar utilizadores' },
  priority_support: { minPlan: 'pro', planFlag: 'has_priority_support', label: 'Suporte prioritário' },
  custom_branding: { minPlan: 'pro', planFlag: 'has_custom_branding', label: 'Personalização de marca' },
  custom_domain: { minPlan: 'entreprise', planFlag: 'has_custom_domain', label: 'Domínio próprio' },
  dedicated_account: { minPlan: 'entreprise', planFlag: 'has_dedicated_account', label: 'Gestor de conta dedicado' },
  saft_export: { minPlan: 'pro', label: 'Exportação SAF-T' },
  slack_alerts: { minPlan: 'entreprise', label: 'Alertas Slack' },
};

export function planRank(slug: PlanSlug): number {
  return PLAN_RANK[slug] ?? 0;
}

export function planLabel(slug: PlanSlug): string {
  switch (slug) {
    case 'starter': return 'Starter';
    case 'pro': return 'Pro';
    case 'entreprise': return 'Empresarial';
  }
}
