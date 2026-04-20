import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { redirectToGoogleOAuth } from '@/lib/google/oauth';
import { queryKeys } from '@/lib/queryKeys';
import { AlertOctagon } from 'lucide-react';
import { toast } from 'sonner';

interface ReauthToken {
  id: string;
  email: string | null;
  reauth_reason: string | null;
  reauth_flagged_at: string | null;
}

async function reconnect(email: string | null) {
  try {
    await redirectToGoogleOAuth({ source: 'settings', loginHint: email ?? undefined });
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'Falha ao ligar Google');
  }
}

export function ReauthBanner() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const { data: tokens } = useQuery<ReauthToken[]>({
    queryKey: [...queryKeys.oauthTokens, userId, 'needs-reauth'],
    queryFn: async () => {
      const { data } = await supabase
        .from('user_oauth_tokens')
        .select('id, email, reauth_reason, reauth_flagged_at')
        .eq('user_id', userId!)
        .eq('provider', 'google')
        .eq('needs_reauth', true);
      return (data as ReauthToken[]) ?? [];
    },
    enabled: !!userId,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
  });

  if (!tokens || tokens.length === 0) return null;

  return (
    <div className="rounded-xl border border-red-300 bg-red-50 p-4">
      <div className="flex items-start gap-3">
        <AlertOctagon className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
        <div className="flex-1 space-y-2">
          <div>
            <p className="font-medium text-red-800">
              {tokens.length === 1 ? 'Conta Google precisa de reautenticação' : 'Contas Google precisam de reautenticação'}
            </p>
            <p className="text-sm text-red-700">
              O acesso foi revogado ou expirou. Sincronização de emails e upload para Drive/Sheets estão parados até reconectares.
            </p>
          </div>
          <ul className="space-y-1.5">
            {tokens.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 rounded-md bg-red-100/60 px-3 py-2">
                <span className="text-sm text-red-900 truncate">{t.email ?? 'conta sem email'}</span>
                <button
                  onClick={() => { void reconnect(t.email); }}
                  className="shrink-0 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
                >
                  Reconectar
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
