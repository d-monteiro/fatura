import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase/client';
import { Building2 } from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@/contexts/I18nContext';
import { CompanyCard } from './CompanyCard';
import type { Company } from '@/types/database';

type CompanyWithToken = Company & { token_expiry?: string | null; refresh_token?: string | null };

export function CompanyList() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const { data: companies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: async () => {
      const { data } = await supabase
        .from('companies')
        .select('*, user_oauth_tokens!oauth_token_id(token_expiry, refresh_token)')
        .eq('is_active', true)
        .order('is_default', { ascending: false })
        .order('name');

      return (data || []).map((c: Record<string, unknown>) => {
        const token = c.user_oauth_tokens as Record<string, unknown> | null;
        return {
          ...c,
          token_expiry: token?.token_expiry ?? null,
          refresh_token: token?.refresh_token ?? null,
        };
      }) as CompanyWithToken[];
    },
  });

  // Handle OAuth callback
  useEffect(() => {
    const oauthStatus = searchParams.get('oauth');
    if (oauthStatus === 'success') {
      const email = searchParams.get('email');
      toast.success(t('company.oauth_success') + (email ? ` (${email})` : ''));
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      setSearchParams((p) => { p.delete('oauth'); p.delete('email'); p.delete('company_id'); return p; });
    } else if (oauthStatus === 'error') {
      const msg = searchParams.get('message');
      toast.error(msg || t('company.oauth_error'));
      setSearchParams((p) => { p.delete('oauth'); p.delete('message'); return p; });
    }
  }, [searchParams, setSearchParams, queryClient, t]);

  return (
    <div className="border border-border rounded-xl p-6">
      <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
        <Building2 size={20} />
        {t('set.companies')}
      </h2>
      <div className="space-y-3">
        {companies.map((c) => (
          <CompanyCard key={c.id} company={c} />
        ))}
      </div>
    </div>
  );
}
