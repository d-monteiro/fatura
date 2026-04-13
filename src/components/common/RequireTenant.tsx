import { useTenant } from '@/contexts/TenantContext';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import type { ReactNode } from 'react';

interface RequireTenantProps {
  children: ReactNode;
}

/**
 * Route guard that ensures user has an active tenant.
 * Redirects to onboarding if no tenant, billing if plan expired.
 * Currently allows through if no tenant (backwards compat until onboarding exists).
 */
export function RequireTenant({ children }: RequireTenantProps) {
  const { tenant, loading, plan } = useTenant();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <LoadingSpinner size={40} />
      </div>
    );
  }

  // TODO: Uncomment when onboarding page exists (Phase 3)
  // if (!tenant) {
  //   return <Navigate to="/onboarding" replace />;
  // }

  // TODO: Uncomment when billing page exists (Phase 5)
  // if (tenant?.plan_status === 'canceled' || tenant?.plan_status === 'past_due') {
  //   return <Navigate to="/billing" replace />;
  // }

  // TODO: Uncomment when onboarding status page exists (Phase 3)
  // if (tenant && tenant.setup_status !== 'ready' && !tenant.onboarding_completed) {
  //   return <Navigate to="/onboarding/status" replace />;
  // }

  // For now: allow through even without tenant (existing single-tenant flow)
  void tenant;
  void plan;

  return <>{children}</>;
}
