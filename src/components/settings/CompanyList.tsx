import { useState } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { Building2, Plus, Check, X } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { useTenant } from '@/contexts/TenantContext';
import { toast } from 'sonner';
import { CompanyCard } from './CompanyCard';
import type { Company } from '@/types/database';
import { queryKeys } from '@/lib/queryKeys';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type CompanyWithToken = Company & { token_expiry?: string | null };

export function CompanyList() {
  const { t } = useI18n();
  const { tenant } = useTenant();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [nif, setNif] = useState('');

  const { data: companies = [] } = useQuery({
    queryKey: queryKeys.companies,
    queryFn: async () => {
      const { data } = await supabase
        .from('companies')
        .select('*, user_oauth_tokens!oauth_token_id(token_expiry)')
        .eq('is_active', true)
        .order('is_default', { ascending: false })
        .order('name');

      return (data || []).map((c: Record<string, unknown>) => {
        const token = c.user_oauth_tokens as Record<string, unknown> | null;
        return {
          ...c,
          token_expiry: token?.token_expiry ?? null,
        };
      }) as CompanyWithToken[];
    },
    enabled: !!tenant?.id,
    placeholderData: keepPreviousData,
  });

  const createCompany = useMutation({
    mutationFn: async () => {
      if (!tenant?.id) throw new Error('Sem tenant activo');
      if (!name.trim()) throw new Error('Nome é obrigatório');
      const short = name.trim().split(/\s+/)[0]?.toUpperCase().substring(0, 16) ?? 'EMPRESA';
      const isDefault = companies.length === 0;
      const { error } = await supabase.from('companies').insert({
        tenant_id: tenant.id,
        name: name.trim(),
        short_name: short,
        nif: nif.trim() || null,
        is_default: isDefault,
        is_active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.companies });
      toast.success('Empresa criada');
      setCreating(false);
      setName('');
      setNif('');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="border border-border rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Building2 size={20} />
          {t('set.companies')}
        </h2>
        {!creating && (
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 text-sm"
          >
            <Plus size={16} /> Nova empresa
          </button>
        )}
      </div>

      {creating && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 mb-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="new-company-name">{t('company.name')} *</Label>
              <Input
                id="new-company-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                placeholder="Ex: Flowzi Lda"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-company-nif">{t('company.nif')}</Label>
              <Input
                id="new-company-nif"
                className="font-mono"
                value={nif}
                onChange={(e) => setNif(e.target.value)}
                placeholder="Opcional"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => createCompany.mutate()}
              disabled={createCompany.isPending || !name.trim()}
              className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" /> {t('action.save')}
            </button>
            <button
              onClick={() => { setCreating(false); setName(''); setNif(''); }}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              <X className="h-3.5 w-3.5" /> {t('action.cancel')}
            </button>
          </div>
        </div>
      )}

      {companies.length === 0 && !creating ? (
        <p className="text-sm text-muted-foreground">
          Ainda não tens empresas. Cria uma para começar a processar faturas.
        </p>
      ) : (
        <div className="space-y-3">
          {companies.map((c) => (
            <CompanyCard key={c.id} company={c} />
          ))}
        </div>
      )}
    </div>
  );
}
