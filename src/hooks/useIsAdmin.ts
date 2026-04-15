import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export function useIsAdmin() {
  const { user, loading: authLoading } = useAuth();

  const query = useQuery({
    queryKey: ['is-admin-global', user?.id],
    enabled: !!user && !authLoading,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('is_admin_global', {
        uid: user!.id,
      });
      if (error) throw error;
      return data === true;
    },
  });

  return {
    isAdmin: query.data === true,
    loading: authLoading || query.isLoading,
    error: query.error,
  };
}
