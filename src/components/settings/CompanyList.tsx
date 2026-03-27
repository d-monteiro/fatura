import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { Building2 } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';

export function CompanyList() {
  const { t } = useI18n();
  const { data: companies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: async () => {
      const { data } = await supabase.from('companies').select('*').eq('is_active', true);
      return data || [];
    },
  });

  return (
    <div className="border border-border rounded-xl p-6">
      <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
        <Building2 size={20} />
        {t('set.companies')}
      </h2>

      <div className="space-y-3">
        {companies.map((c: any) => (
          <div key={c.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <div>
              <p className="font-medium">{c.name}</p>
              <p className="text-xs text-muted-foreground">
                {c.siret ? `SIRET: ${c.siret}` : 'SIRET non renseigné'}
                {c.tva_intracom ? ` | TVA: ${c.tva_intracom}` : ''}
              </p>
            </div>
            <span className="text-xs px-2 py-1 bg-success/10 text-success rounded font-medium">
              {c.short_name}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
