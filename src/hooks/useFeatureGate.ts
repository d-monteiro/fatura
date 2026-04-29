import { useTenant } from '@/contexts/TenantContext';
import { FEATURES, planLabel, planRank, type FeatureKey } from '@/lib/billing/featureMap';
import type { PlanSlug } from '@/types/tenant';

export type FeatureGateReason = 'no_plan' | 'plan_locked';

export interface FeatureGateResult {
  allowed: boolean;
  reason: FeatureGateReason | null;
  upgradeTo: PlanSlug | null;
  message: string | null;
}

export function useFeatureGate(feature: FeatureKey): FeatureGateResult {
  const { plan } = useTenant();
  const spec = FEATURES[feature];

  if (!plan) {
    return {
      allowed: false,
      reason: 'no_plan',
      upgradeTo: spec.minPlan,
      message: 'Necessita de um plano activo.',
    };
  }

  if (spec.planFlag && !plan[spec.planFlag]) {
    return {
      allowed: false,
      reason: 'plan_locked',
      upgradeTo: spec.minPlan,
      message: `${spec.label} disponível no plano ${planLabel(spec.minPlan)}.`,
    };
  }

  if (!spec.planFlag && planRank(plan.slug) < planRank(spec.minPlan)) {
    return {
      allowed: false,
      reason: 'plan_locked',
      upgradeTo: spec.minPlan,
      message: `${spec.label} disponível no plano ${planLabel(spec.minPlan)}.`,
    };
  }

  return { allowed: true, reason: null, upgradeTo: null, message: null };
}
