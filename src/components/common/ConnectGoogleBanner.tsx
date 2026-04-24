import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { redirectToGoogleOAuth } from '@/lib/google/oauth';
import { hasStorageScopes } from '@/lib/google/scopes';
import { queryKeys } from '@/lib/queryKeys';
import { AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import type { OAuthToken } from '@/types/database';

type PrimaryToken = Pick<OAuthToken, 'scopes' | 'email'> | null;

async function startOAuth(loginHint?: string) {
  try {
    await redirectToGoogleOAuth({ source: 'upload', loginHint });
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'Falha ao ligar Google');
  }
}

export function ConnectGoogleBanner() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const { data: primary, isLoading } = useQuery<PrimaryToken>({
    queryKey: [...queryKeys.oauthTokens, userId, 'primary'],
    queryFn: async () => {
      const { data } = await supabase
        .from('user_oauth_tokens')
        .select('scopes, email')
        .eq('user_id', userId!)
        .eq('provider', 'google')
        .order('is_primary_storage', { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data as PrimaryToken) ?? null;
    },
    enabled: !!userId,
    staleTime: 60 * 1000,
  });

  if (!userId || isLoading) return null;

  if (!primary) {
    return (
      <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4 space-y-3">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-yellow-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium text-yellow-800">Ligar conta Google</p>
            <p className="text-sm text-yellow-700">
              Ainda não ligaste nenhuma conta Google. Upload e sincronização não vão funcionar até ligares uma.
            </p>
          </div>
          <button
            onClick={() => { void startOAuth(); }}
            className="rounded-md bg-yellow-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-yellow-700"
          >
            Ligar agora
          </button>
        </div>
        <p className="text-[11px] leading-relaxed text-yellow-900/70">
          A utilização e transferência para outras apps, por parte do FaturaAI, de informações recebidas das APIs da Google cumprem a{' '}
          <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer" className="underline">
            Google API Services User Data Policy
          </a>
          , incluindo os requisitos de Limited Use.
        </p>
      </div>
    );
  }

  if (!hasStorageScopes(primary.scopes)) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-orange-200 bg-orange-50 p-4">
        <AlertTriangle className="h-5 w-5 text-orange-600 shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="font-medium text-orange-800">Permissões Google incompletas</p>
          <p className="text-sm text-orange-700">
            A conta {primary.email ?? ''} não tem acesso ao Drive. Reautentica para continuar.
          </p>
        </div>
        <button
          onClick={() => { void startOAuth(primary.email ?? undefined); }}
          className="rounded-md bg-orange-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-700"
        >
          Reautenticar
        </button>
      </div>
    );
  }

  return null;
}
