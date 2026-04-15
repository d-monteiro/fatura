import { Navigate, useLocation } from 'react-router-dom';
import { useTenant } from '@/contexts/TenantContext';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import type { ReactNode } from 'react';

interface RequireTenantProps {
  children: ReactNode;
}

export function RequireTenant({ children }: RequireTenantProps) {
  const { tenant, loading } = useTenant();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <LoadingSpinner size={40} />
      </div>
    );
  }

  if (!tenant) {
    return <Navigate to="/onboarding" replace />;
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
