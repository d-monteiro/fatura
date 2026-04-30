import { useEffect, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useRole } from '@/hooks/useRole';
import { READ_ONLY_HINT, type PermissionAction } from '@/lib/auth/permissions';

interface Props {
  action: PermissionAction;
  children: ReactNode;
  fallback?: string;
}

export function RequirePermission({ action, children, fallback = '/' }: Props) {
  const { can, isReadOnly } = useRole();
  const allowed = can(action);

  useEffect(() => {
    if (!allowed && isReadOnly) toast.info(READ_ONLY_HINT);
  }, [allowed, isReadOnly]);

  if (!allowed) return <Navigate to={fallback} replace />;
  return <>{children}</>;
}
