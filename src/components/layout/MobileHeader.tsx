import { Menu } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import type { Company } from '@/types/database';
import { queryKeys } from '@/lib/queryKeys';

interface MobileHeaderProps {
  onMenuToggle: () => void;
}

export function MobileHeader({ onMenuToggle }: MobileHeaderProps) {
  const { t } = useI18n();
  const [searchParams] = useSearchParams();
  const activeCompany = searchParams.get('company') || 'all';

  const { data: companies = [] } = useQuery({
    queryKey: queryKeys.companies,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies').select('*').eq('is_active', true).order('name');
      if (error) throw error;
      return data as Company[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const label = activeCompany === 'all'
    ? t('company.all')
    : companies.find((c) => c.id === activeCompany)?.name ?? t('company.all');

  return (
    <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-3 border-b border-gray-200 bg-white px-4 md:hidden">
      <button onClick={onMenuToggle} className="min-h-[44px] min-w-[44px] flex items-center justify-center -ml-2 rounded-lg hover:bg-gray-100">
        <Menu className="h-5 w-5 text-gray-700" />
      </button>
      <span className="text-lg font-bold tracking-tight text-primary">
        Fatura<span className="text-accent">AI</span>
      </span>
      <span className="ml-auto truncate text-xs text-gray-500">{label}</span>
    </header>
  );
}
