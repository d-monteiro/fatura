import { useMemo } from 'react';
import { useTenantOptional } from '@/contexts/TenantContext';
import { can as canDo, type PermissionAction } from '@/lib/auth/permissions';
import type { TenantRole } from '@/types/tenant';

export interface RoleHelpers {
  // null enquanto o tenant ainda não resolveu — distingue de "readonly real".
  role: TenantRole | null;
  loading: boolean;
  isReadOnly: boolean;
  can: (action: PermissionAction) => boolean;
}

// Devolver `role: null + loading: true` em vez de defaultar a 'readonly'
// evita falsos positivos: um owner que recarrega /upload nunca vê toast
// "Conta de consulta…" só porque o TenantContext ainda não terminou.
export function useRole(): RoleHelpers {
  const ctx = useTenantOptional();
  const loading = !ctx || ctx.loading;
  const role: TenantRole | null = ctx?.tenant ? ctx.role : null;

  return useMemo(
    () => ({
      role,
      loading,
      isReadOnly: role === 'readonly',
      can: (action) => (role === null ? false : canDo(role, action)),
    }),
    [role, loading],
  );
}

export type { PermissionAction };
