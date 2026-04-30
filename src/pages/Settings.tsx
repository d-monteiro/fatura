import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CompanyList } from '@/components/settings/CompanyList';
import { BusinessProfileCard } from '@/components/settings/BusinessProfileCard';
import { BusinessProfileReadView } from '@/components/settings/BusinessProfileReadView';
import { CategoriesCard } from '@/components/settings/CategoriesCard';
import { GoogleAccountsUnified } from '@/components/settings/GoogleAccountsUnified';
import { PasswordCard } from '@/components/settings/PasswordCard';
import { ReportsCard } from '@/components/settings/ReportsCard';
import { TeamCard } from '@/components/settings/TeamCard';
import { ReadOnlySupportCard } from '@/components/settings/ReadOnlySupportCard';
import { useI18n } from '@/contexts/I18nContext';
import { useAuth } from '@/contexts/AuthContext';
import { useRole } from '@/hooks/useRole';
import { queryKeys } from '@/lib/queryKeys';

export default function Settings() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { isReadOnly } = useRole();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    const oauth = searchParams.get('oauth');
    const email = searchParams.get('email');
    if (oauth === 'success') {
      toast.success(`Conta Google ligada${email ? ` (${email})` : ''}`);
      qc.invalidateQueries({ queryKey: queryKeys.oauthTokens });
      qc.invalidateQueries({ queryKey: queryKeys.companies });
      qc.invalidateQueries({ queryKey: queryKeys.emailAccounts });
      setSearchParams((p) => { p.delete('oauth'); p.delete('email'); p.delete('company_id'); return p; });
    } else if (oauth === 'error') {
      toast.error(searchParams.get('message') || 'Erro ao ligar conta Google');
      setSearchParams((p) => { p.delete('oauth'); p.delete('message'); return p; });
    }
  }, [searchParams, setSearchParams, qc]);

  if (isReadOnly) {
    return (
      <div className="space-y-6 sm:space-y-8 max-w-4xl">
        <h1 className="text-xl font-bold sm:text-2xl">{t('nav.settings')}</h1>
        <BusinessProfileReadView />
        <PasswordCard />
        <ReadOnlySupportCard />
      </div>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8 max-w-4xl">
      <h1 className="text-xl font-bold sm:text-2xl">{t('nav.settings')}</h1>
      <BusinessProfileCard />
      <CategoriesCard />
      <ReportsCard />
      {user && <GoogleAccountsUnified userId={user.id} />}
      <CompanyList />
      <TeamCard />
      <PasswordCard />
    </div>
  );
}
