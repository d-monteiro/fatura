import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CompanyList } from '@/components/settings/CompanyList';
import { BusinessProfileCard } from '@/components/settings/BusinessProfileCard';
import { CategoriesCard } from '@/components/settings/CategoriesCard';
import { GoogleAccountsUnified } from '@/components/settings/GoogleAccountsUnified';
import { useI18n } from '@/contexts/I18nContext';
import { useAuth } from '@/contexts/AuthContext';
import { queryKeys } from '@/lib/queryKeys';

export default function Settings() {
  const { t } = useI18n();
  const { user } = useAuth();
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

  return (
    <div className="space-y-6 sm:space-y-8 max-w-4xl">
      <h1 className="text-xl font-bold sm:text-2xl">{t('nav.settings')}</h1>
      <BusinessProfileCard />
      <CategoriesCard />
      {user && <GoogleAccountsUnified userId={user.id} />}
      <CompanyList />
    </div>
  );
}
