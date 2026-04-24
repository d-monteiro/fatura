import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { hasStorageScopes } from '@/lib/google/scopes';

export interface UploadDeps {
  userId: string | null;
  companyId: string | null;
  accessToken: string | null;
  primaryEmail: string | null;
  ready: boolean;
  noGoogle: boolean;
  needsReauth: boolean;
  loading: boolean;
}

interface PrimaryToken {
  access_token: string;
  scopes: string[] | null;
  email: string | null;
}

export function useUploadDeps(): UploadDeps {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const companyParam = searchParams.get('company');
  const userId = user?.id ?? null;

  const { data: companyId, isLoading: companyLoading } = useQuery({
    queryKey: ['company-id', companyParam],
    queryFn: async () => {
      if (!companyParam || companyParam === 'all') return null;
      const { data: byId } = await supabase
        .from('companies').select('id')
        .eq('id', companyParam).eq('is_active', true).single();
      if (byId?.id) return byId.id;
      const { data: byName } = await supabase
        .from('companies').select('id')
        .ilike('short_name', companyParam).eq('is_active', true).single();
      return byName?.id ?? null;
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: primary, isLoading: tokenLoading } = useQuery<PrimaryToken | null>({
    queryKey: ['google-token', userId],
    queryFn: async () => {
      const { data } = await supabase
        .from('user_oauth_tokens').select('access_token, scopes, email')
        .eq('user_id', userId!).eq('provider', 'google')
        .order('is_primary_storage', { ascending: false })
        .limit(1).single();
      return (data as PrimaryToken | null) ?? null;
    },
    enabled: !!userId,
    staleTime: 2 * 60 * 1000,
  });

  const loading = companyLoading || tokenLoading;
  const accessToken = primary?.access_token ?? null;
  const hasStorage = hasStorageScopes(primary?.scopes ?? null);

  return {
    userId,
    companyId: companyId ?? null,
    accessToken,
    primaryEmail: primary?.email ?? null,
    ready: !loading && !!userId && !!accessToken && hasStorage,
    noGoogle: !tokenLoading && !accessToken,
    needsReauth: !tokenLoading && !!accessToken && !hasStorage,
    loading,
  };
}
