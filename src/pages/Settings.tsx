import { CompanyList } from '@/components/settings/CompanyList';
import { useI18n } from '@/contexts/I18nContext';

export default function Settings() {
  const { t } = useI18n();

  return (
    <div className="space-y-6 sm:space-y-8 max-w-4xl">
      <h1 className="text-xl font-bold sm:text-2xl">{t('nav.settings')}</h1>
      <CompanyList />
    </div>
  );
}
