import { useTenant } from '@/contexts/TenantContext';

type Feature =
  | 'email_sync'
  | 'auto_sheets'
  | 'reports'
  | 'api_access'
  | 'multi_user'
  | 'dashboard'
  | 'drive_storage'
  | 'manual_upload'
  | 'custom_branding'
  | 'custom_domain'
  | 'priority_support';

export function useFeatureGate(feature: Feature): boolean {
  const { plan } = useTenant();
  if (!plan) return false;

  const featureMap: Record<Feature, boolean> = {
    email_sync: plan.has_email_sync,
    auto_sheets: plan.has_auto_sheets,
    reports: plan.has_reports,
    api_access: plan.has_api_access,
    multi_user: plan.has_multi_user,
    dashboard: plan.has_dashboard,
    drive_storage: plan.has_drive_storage,
    manual_upload: plan.has_manual_upload,
    custom_branding: plan.has_custom_branding,
    custom_domain: plan.has_custom_domain,
    priority_support: plan.has_priority_support,
  };

  return featureMap[feature] ?? false;
}
