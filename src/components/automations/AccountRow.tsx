import {
  Mail,
  Star,
  AlertCircle,
  CheckCircle2,
  LogIn,
  Trash2,
} from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { supabase } from '@/lib/supabase/client';
import { toast } from 'sonner';
import {
  type ConnectedAccount,
  isTokenExpired,
  buildGoogleAuthUrl,
} from './useAutomationsData';

interface Props {
  account: ConnectedAccount;
  onRefresh: () => void;
}

export function AccountRow({ account: acc, onRefresh }: Props) {
  const { t } = useI18n();
  const expired = isTokenExpired(acc.token_expiry);
  const hasRefresh = !!acc.refresh_token;
  const needsReauth = expired && !hasRefresh;
  const locale = 'pt-PT';

  async function handleSetPrimary() {
    await supabase.from('user_oauth_tokens').update({ is_primary_storage: false }).eq('provider', 'google');
    const { error } = await supabase.from('user_oauth_tokens').update({ is_primary_storage: true }).eq('id', acc.id);
    if (error) { toast.error('Erro'); } else { toast.success(`${acc.email} ${t('auto.set_primary_ok')}`); onRefresh(); }
  }

  async function handleRemove() {
    if (!confirm(`Remover a conta ${acc.email}? Isto revoga o acesso no Google.`)) return;

    const { data: tokenData } = await supabase.from('user_oauth_tokens').select('access_token').eq('id', acc.id).single();
    let revoked = false;
    if (tokenData?.access_token) {
      try {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 10000);
        const res = await fetch(`https://oauth2.googleapis.com/revoke?token=${tokenData.access_token}`, {
          method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: ctrl.signal,
        });
        clearTimeout(tid);
        revoked = res.ok;
      } catch { /* continue */ }
    }

    const { error } = await supabase.from('user_oauth_tokens').delete().eq('id', acc.id);
    if (error) { toast.error('Erro'); } else { toast.success(revoked ? t('auto.removed_revoked') : t('auto.removed')); onRefresh(); }
  }

  async function handleReauth() {
    const authUrl = buildGoogleAuthUrl(acc.email);
    if (!authUrl) { toast.error('Config manquante'); return; }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error('Session expirée'); return; }
    authUrl.searchParams.set('state', JSON.stringify({ user_id: user.id }));
    window.location.href = authUrl.toString();
  }

  return (
    <div className={`p-3 rounded-lg border ${
      needsReauth ? 'bg-red-50 border-red-200'
        : acc.is_primary_storage ? 'bg-blue-50/50 border-blue-200'
        : 'bg-background border-border'
    }`}>
      <div className="flex items-start gap-3">
        <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${
          needsReauth ? 'bg-red-100' : acc.is_primary_storage ? 'bg-blue-100' : 'bg-gray-100'
        }`}>
          <Mail className={`h-5 w-5 ${needsReauth ? 'text-red-600' : 'text-blue-600'}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <p className="font-medium text-sm sm:text-base truncate">{acc.email}</p>
            {acc.is_primary_storage && (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded border border-blue-200">
                <Star className="h-3 w-3" />
                <span className="hidden sm:inline">{t('auto.storage')}</span>
              </span>
            )}
            {needsReauth && (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded border border-red-200">
                <AlertCircle className="h-3 w-3" />
                <span className="hidden sm:inline">{t('auto.reauth')}</span>
              </span>
            )}
            {hasRefresh && (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded border border-green-200">
                <CheckCircle2 className="h-3 w-3" />
                <span className="hidden sm:inline">{t('auto.auto_renew')}</span>
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {hasRefresh
              ? t('auto.token_auto_renew')
              : expired
                ? `${t('auto.token_expired_at')} ${new Date(acc.token_expiry).toLocaleDateString(locale)}`
                : `${t('auto.token_expires_at')} ${new Date(acc.token_expiry).toLocaleDateString(locale)}`
            }
          </p>
        </div>
      </div>
      <div className="flex items-center justify-end gap-1 mt-2 pt-2 border-t border-border/50">
        {needsReauth && (
          <button onClick={handleReauth} className="flex items-center gap-1 px-3 py-1.5 text-sm text-red-600 border border-red-300 rounded-lg hover:bg-red-50 flex-1 sm:flex-none justify-center">
            <LogIn className="h-4 w-4" /> {t('auto.reauth')}
          </button>
        )}
        {!acc.is_primary_storage && !needsReauth && (
          <button onClick={handleSetPrimary} title={t('auto.set_primary')} className="p-1.5 text-muted-foreground hover:text-blue-600 rounded-lg hover:bg-blue-50">
            <Star className="h-4 w-4" />
          </button>
        )}
        <button onClick={handleRemove} className="p-1.5 text-destructive hover:bg-red-50 rounded-lg">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
