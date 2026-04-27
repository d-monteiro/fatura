import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { queryKeys } from '@/lib/queryKeys';
import type { TenantRole } from '@/types/tenant';

export interface TenantMember {
  user_id: string;
  email: string;
  role: TenantRole;
  is_active: boolean;
  accepted_at: string | null;
  invited_at: string | null;
  created_at: string;
}

export function useTenantMembers(tenantId: string | null) {
  return useQuery({
    queryKey: queryKeys.tenantMembers(tenantId),
    enabled: !!tenantId,
    queryFn: async (): Promise<TenantMember[]> => {
      const { data, error } = await supabase.rpc('list_tenant_members', { p_tenant_id: tenantId });
      if (error) throw error;
      return (data ?? []) as TenantMember[];
    },
  });
}
