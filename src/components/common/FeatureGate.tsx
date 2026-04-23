import type { ReactNode } from 'react';
import { useTenant } from '@/contexts/TenantContext';
import type { Feature } from '@/hooks/useFeatureGate';

type GatedFeature = Extract<Feature, 'email_sync' | 'auto_sheets' | 'reports' | 'api_access' | 'multi_user'>;

const featureToGate: Record<GatedFeature, keyof ReturnType<typeof useTenant>> = {
  email_sync: 'canUseEmailSync',
  auto_sheets: 'canUseAutoSheets',
  reports: 'canUseReports',
  api_access: 'canUseAPI',
  multi_user: 'canInviteUsers',
};

interface FeatureGateProps {
  feature: GatedFeature;
  children: ReactNode;
  fallback?: ReactNode;
}

export function FeatureGate({ feature, children, fallback }: FeatureGateProps) {
  const tenant = useTenant();
  const gateKey = featureToGate[feature];
  const allowed = Boolean(tenant[gateKey]);

  if (!allowed) {
    return fallback ?? null;
  }

  return <>{children}</>;
}
