import { useAuth } from '@/contexts/AuthContext';
import { GoogleAccounts } from '@/components/settings/GoogleAccounts';
import { EmailAccounts } from '@/components/settings/EmailAccounts';
import { CompanyList } from '@/components/settings/CompanyList';
import { useI18n } from '@/contexts/I18nContext';

export default function Settings() {
  const { t } = useI18n();
  const { user } = useAuth();

  return (
    <div className="p-6 space-y-8 max-w-4xl">
      <h1 className="text-2xl font-bold">{t('nav.settings')}</h1>

      <GoogleAccounts userId={user?.id || ''} />
      <EmailAccounts userId={user?.id || ''} />
      <CompanyList />
    </div>
  );
}
