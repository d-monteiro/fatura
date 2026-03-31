import { Zap } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { CheckEmails } from '@/components/automations/CheckEmails';
import { AutoSyncStatus } from '@/components/automations/AutoSyncStatus';

export default function Automations() {
  const { t } = useI18n();

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-bold sm:text-2xl flex items-center gap-2">
          <Zap className="h-6 w-6 sm:h-7 sm:w-7 text-primary" />
          {t('auto.title')}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('auto.subtitle')}
        </p>
      </div>

      <CheckEmails />
      <AutoSyncStatus />
    </div>
  );
}
