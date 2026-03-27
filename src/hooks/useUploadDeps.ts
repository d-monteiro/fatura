/**
 * Hook that resolves Upload page dependencies:
 * - company UUID from the URL ?company= search param (short_name)
 * - Google access token from user_oauth_tokens
 */
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface UploadDeps {
  userId: string | null;
  companyId: string | null;
  accessToken: string | null;
  ready: boolean;         // true once both company + token are resolved
  noGoogle: boolean;      // true when user has no connected Google account
  noCompany: boolean;     // true when URL company param doesn't match any DB company
  loading: boolean;
}

export function useUploadDeps(): UploadDeps {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const companyParam = searchParams.get('company') || 'lgm';
  const userId = user?.id ?? null;

  // Resolve company: specific selection or first company when "all"
  const { data: companyId, isLoading: companyLoading } = useQuery({
    queryKey: ['company-id', companyParam],
    queryFn: async () => {
      if (companyParam === 'all') {
        // Default to first company (LGM) when "all" is selected
        const { data } = await supabase
          .from('companies')
          .select('id')
          .eq('is_active', true)
          .order('name')
          .limit(1)
          .single();
        return data?.id ?? null;
      }
      // Try UUID first, then short_name
      const { data: byId } = await supabase
        .from('companies')
        .select('id')
        .eq('id', companyParam)
        .eq('is_active', true)
        .single();
      if (byId?.id) return byId.id;
      const { data: byName } = await supabase
        .from('companies')
        .select('id')
        .ilike('short_name', companyParam)
        .eq('is_active', true)
        .single();
      return byName?.id ?? null;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Fetch Google access token (first primary_storage, or first google token)
  const { data: accessToken, isLoading: tokenLoading } = useQuery({
    queryKey: ['google-token', userId],
    queryFn: async () => {
      const { data } = await supabase
        .from('user_oauth_tokens')
        .select('access_token')
        .eq('user_id', userId!)
        .eq('provider', 'google')
        .order('is_primary_storage', { ascending: false })
        .limit(1)
        .single();
      return data?.access_token ?? null;
    },
    enabled: !!userId,
    staleTime: 2 * 60 * 1000,
  });

  const loading = companyLoading || tokenLoading;
  const resolvedCompanyId = companyId ?? null;

  return {
    userId,
    companyId: resolvedCompanyId,
    accessToken: accessToken ?? null,
    ready: !loading && !!resolvedCompanyId && !!accessToken,
    noGoogle: !tokenLoading && !accessToken,
    noCompany: !companyLoading && !resolvedCompanyId,
    loading,
  };
}
