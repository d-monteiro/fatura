import { useMemo } from 'react';
import { useTenantOptional } from '@/contexts/TenantContext';
import { can as canDo, type PermissionAction } from '@/lib/auth/permissions';
import type { TenantRole } from '@/types/tenant';

export interface RoleHelpers {
  role: TenantRole;
  isReadOnly: boolean;
  can: (action: PermissionAction) => boolean;
}

// Default 'readonly' (least privilege) se chamado fora de TenantProvider ou
// antes de loadTenant resolver — assim um flicker inicial nunca expõe acções
// destrutivas a quem ainda não foi resolvido como member/owner.
export function useRole(): RoleHelpers {
  const ctx = useTenantOptional();
  const role: TenantRole = ctx?.tenant ? ctx.role : 'readonly';
  return useMemo(
    () => ({
      role,
      isReadOnly: role === 'readonly',
      can: (action: PermissionAction) => canDo(role, action),
    }),
    [role],
  );
}

export type { PermissionAction };
