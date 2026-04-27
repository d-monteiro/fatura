import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { queryKeys } from '@/lib/queryKeys';
import type { TenantRole } from '@/types/tenant';

export interface TenantInvite {
  id: string;
  created_at: string;
  email: string;
  role: Exclude<TenantRole, 'owner'>;
  token: string;
  expires_at: string;
  invited_by: string;
}

export function useTenantInvites(tenantId: string | null) {
  return useQuery({
    queryKey: queryKeys.tenantInvites(tenantId),
    enabled: !!tenantId,
    queryFn: async (): Promise<TenantInvite[]> => {
      const { data, error } = await supabase
        .from('tenant_invites')
        .select('id, created_at, email, role, token, expires_at, invited_by')
        .eq('tenant_id', tenantId!)
        .is('accepted_at', null)
        .is('revoked_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as TenantInvite[];
    },
  });
}
