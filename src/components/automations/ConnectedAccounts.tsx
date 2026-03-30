import { useState } from 'react';
import { Users, Plus, RefreshCw } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { supabase } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { AccountRow } from './AccountRow';
import { ExpiredTokenAlert } from './ExpiredTokenAlert';
import {
  type ConnectedAccount,
  isTokenExpired,
  buildGoogleAuthUrl,
} from './useAutomationsData';

interface Props {
  accounts: ConnectedAccount[];
  loading: boolean;
  onRefresh: () => void;
}

export function ConnectedAccounts({ accounts, loading, onRefresh }: Props) {
  const { t } = useI18n();
  const [addingAccount, setAddingAccount] = useState(false);

  const hasExpiredPrimaryWithoutRefresh = accounts.some(
    (a) => a.is_primary_storage && isTokenExpired(a.token_expiry) && !a.refresh_token,
  );

  async function handleAddAccount() {
    setAddingAccount(true);
    const authUrl = buildGoogleAuthUrl();
    if (!authUrl) {
      toast.error('Google Client ID ou Supabase URL non configuré');
      setAddingAccount(false);
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error('Session expirée. Reconnectez-vous.');
      setAddingAccount(false);
      return;
    }
    authUrl.searchParams.set('state', JSON.stringify({ user_id: user.id }));
    window.location.href = authUrl.toString();
  }

  return (
    <div className="border border-border rounded-xl p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Users size={20} />
            {t('auto.connected_accounts')}
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            {t('auto.connected_desc')}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onRefresh}
            disabled={loading}
            className="p-2 rounded-lg border border-border hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleAddAccount}
            disabled={addingAccount}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 text-sm disabled:opacity-50"
          >
            <Plus size={16} />
            {t('auto.add_account')}
          </button>
        </div>
      </div>

      {hasExpiredPrimaryWithoutRefresh && <ExpiredTokenAlert />}

      {accounts.length === 0 ? (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-yellow-50 border border-yellow-200">
          <Users className="h-5 w-5 text-yellow-600" />
          <div>
            <p className="font-medium text-yellow-800">{t('auto.no_accounts')}</p>
            <p className="text-sm text-yellow-700">{t('auto.no_accounts_desc')}</p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {accounts.map((acc) => (
            <AccountRow key={acc.id} account={acc} onRefresh={onRefresh} />
          ))}
        </div>
      )}
    </div>
  );
}
