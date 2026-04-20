import { Navigate, useLocation } from 'react-router-dom';
import { useTenant } from '@/contexts/TenantContext';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import type { ReactNode } from 'react';

interface RequireTenantProps {
  children: ReactNode;
}

export function RequireTenant({ children }: RequireTenantProps) {
  const { tenant, loading: tenantLoading } = useTenant();
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const location = useLocation();

  if (tenantLoading || adminLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <LoadingSpinner size={40} />
      </div>
    );
  }

  if (isAdmin) {
    return <Navigate to="/admin" replace />;
  }

  if (!tenant) {
    return <Navigate to="/onboarding" replace />;
  }

  if (!tenant.is_active || tenant.plan_status === 'paused') {
    if (location.pathname !== '/account/suspended') {
      return <Navigate to="/account/suspended" replace />;
    }
  }

  if (tenant.plan_status === 'canceled' || tenant.plan_status === 'past_due') {
    if (location.pathname !== '/billing') {
      return <Navigate to="/billing" replace />;
    }
  }

  if (!tenant.onboarding_completed && tenant.setup_status !== 'ready') {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}
