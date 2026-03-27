import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { Globe, Trash2, Plus } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

const SCOPES = [
  'email',
  'profile',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
].join(' ');

export function GoogleAccounts({ userId }: { userId: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['oauth-tokens', userId],
    queryFn: async () => {
      const { data } = await supabase
        .from('user_oauth_tokens')
        .select('*')
        .eq('user_id', userId)
        .eq('provider', 'google');
      return data || [];
    },
    enabled: !!userId,
  });

  const deleteMutation = useMutation({
    mutationFn: async (tokenId: string) => {
      await supabase.from('user_oauth_tokens').delete().eq('id', tokenId);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['oauth-tokens'] }),
  });

  function connectGoogle() {
    const state = JSON.stringify({ user_id: userId });
    const redirectUri = `${SUPABASE_URL}/functions/v1/oauth-callback`;
    const url = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${GOOGLE_CLIENT_ID}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent(SCOPES)}` +
      `&access_type=offline` +
      `&prompt=consent` +
      `&state=${encodeURIComponent(state)}`;
    window.location.href = url;
  }

  return (
    <div className="border border-border rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Globe size={20} />
          Comptes Google
        </h2>
        <button
          onClick={connectGoogle}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 text-sm"
        >
          <Plus size={16} />
          {t('action.connect_google')}
        </button>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Chargement...</p>
      ) : accounts.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Aucun compte Google connecté. Connectez un compte pour activer Google Drive, Sheets et Gmail.
        </p>
      ) : (
        <div className="space-y-3">
          {accounts.map((acc: any) => (
            <div key={acc.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <div>
                <p className="font-medium">{acc.email}</p>
                <div className="flex gap-2 mt-1">
                  {acc.scopes?.includes('https://www.googleapis.com/auth/drive.file') && (
                    <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded">Drive</span>
                  )}
                  {acc.scopes?.some((s: string) => s.includes('gmail')) && (
                    <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded">Gmail</span>
                  )}
                  {acc.scopes?.includes('https://www.googleapis.com/auth/spreadsheets') && (
                    <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded">Sheets</span>
                  )}
                  {acc.is_primary_storage && (
                    <span className="text-xs px-2 py-0.5 bg-accent text-accent-foreground rounded">Principal</span>
                  )}
                </div>
              </div>
              <button
                onClick={() => deleteMutation.mutate(acc.id)}
                className="text-destructive hover:opacity-70 p-2"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
