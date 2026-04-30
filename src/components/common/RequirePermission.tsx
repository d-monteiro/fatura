import { useEffect, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useRole } from '@/hooks/useRole';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { READ_ONLY_HINT, type PermissionAction } from '@/lib/auth/permissions';

interface Props {
  action: PermissionAction;
  children: ReactNode;
  fallback?: string;
}

export function RequirePermission({ action, children, fallback = '/' }: Props) {
  const { can, loading, isReadOnly } = useRole();
  const allowed = !loading && can(action);
  const denied = !loading && !allowed;

  useEffect(() => {
    if (denied && isReadOnly) toast.info(READ_ONLY_HINT);
  }, [denied, isReadOnly]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <LoadingSpinner size={40} />
      </div>
    );
  }
  if (!allowed) return <Navigate to={fallback} replace />;
  return <>{children}</>;
}
