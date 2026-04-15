import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { Building2 } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { CompanyCard } from './CompanyCard';
import type { Company } from '@/types/database';
import { queryKeys } from '@/lib/queryKeys';

type CompanyWithToken = Company & { token_expiry?: string | null; refresh_token?: string | null };

export function CompanyList() {
  const { t } = useI18n();

  const { data: companies = [] } = useQuery({
    queryKey: queryKeys.companies,
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
