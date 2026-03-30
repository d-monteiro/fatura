import { Zap } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { ConnectedAccounts } from '@/components/automations/ConnectedAccounts';
import { CheckEmails } from '@/components/automations/CheckEmails';
import { AutoSyncStatus } from '@/components/automations/AutoSyncStatus';
import { useAutomationsData } from '@/components/automations/useAutomationsData';

export default function Automations() {
  const { t } = useI18n();
  const { accounts, loading, fetchAccounts } = useAutomationsData();

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold sm:text-2xl flex items-center gap-2">
          <Zap className="h-6 w-6 sm:h-7 sm:w-7 text-primary" />
          {t('auto.title')}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('auto.subtitle')}
        </p>
      </div>

      {/* Section 1: Connected Accounts */}
      <ConnectedAccounts
        accounts={accounts}
        loading={loading}
        onRefresh={fetchAccounts}
      />

      {/* Section 2: Check Emails (only when accounts exist) */}
      {accounts.length > 0 && <CheckEmails />}

      {/* Section 3: Auto Sync Status + How it works */}
      <AutoSyncStatus />
    </div>
  );
}
