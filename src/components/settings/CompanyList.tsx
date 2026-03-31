import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { Building2, Pencil, Check, X } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import type { Company } from '@/types/database';

interface EditState {
  name: string;
  siret: string;
  tva_intracom: string;
  address: string;
}

export function CompanyList() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<EditState>({ name: '', siret: '', tva_intracom: '', address: '' });
  const [error, setError] = useState('');

  const { data: companies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: async () => {
      const { data } = await supabase.from('companies').select('*').eq('is_active', true);
      return (data || []) as Company[];
    },
  });

  const mutation = useMutation({
    mutationFn: async (id: string) => {
      const siretClean = form.siret.replace(/\s/g, '');
      if (siretClean && !/^\d{14}$/.test(siretClean)) throw new Error(t('sup.siret_invalid'));

      const { error: dbErr } = await supabase
        .from('companies')
        .update({
          name: form.name || undefined,
          siret: siretClean || null,
          tva_intracom: form.tva_intracom || null,
          address: form.address || null,
        })
        .eq('id', id);
      if (dbErr) throw dbErr;
    },
    onSuccess: () => {
      setEditingId(null);
      setError('');
      queryClient.invalidateQueries({ queryKey: ['companies'] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const startEdit = (c: Company) => {
    setEditingId(c.id);
    setError('');
    setForm({
      name: c.name,
      siret: c.siret ?? '',
      tva_intracom: c.tva_intracom ?? '',
      address: c.address ?? '',
    });
  };

  const cancelEdit = () => { setEditingId(null); setError(''); };
  const update = (field: keyof EditState, value: string) => setForm((p) => ({ ...p, [field]: value }));
  const inputCls = 'w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';

  return (
    <div className="border border-border rounded-xl p-6">
      <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
        <Building2 size={20} />
        {t('set.companies')}
      </h2>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      <div className="space-y-3">
        {companies.map((c) => (
          <div key={c.id} className="p-3 bg-muted rounded-lg">
            {editingId === c.id ? (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-0.5">{t('company.name')}</label>
                    <input className={inputCls} value={form.name} onChange={(e) => update('name', e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-0.5">{t('company.siret')}</label>
                    <input className={`${inputCls} font-mono`} value={form.siret} onChange={(e) => update('siret', e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-0.5">{t('company.tva_intracom')}</label>
                    <input className={`${inputCls} font-mono`} value={form.tva_intracom} onChange={(e) => update('tva_intracom', e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-0.5">{t('company.address')}</label>
                    <input className={inputCls} value={form.address} onChange={(e) => update('address', e.target.value)} />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => mutation.mutate(c.id)}
                    disabled={mutation.isPending}
                    className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1 text-xs font-medium text-white shadow-sm hover:opacity-90 transition-all disabled:opacity-50"
                  >
                    <Check className="h-3.5 w-3.5" /> {t('action.save')}
                  </button>
                  <button
                    onClick={cancelEdit}
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    <X className="h-3.5 w-3.5" /> {t('action.cancel')}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{c.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.siret ? `SIRET: ${c.siret}` : 'SIRET non renseigne'}
                    {c.tva_intracom ? ` | TVA: ${c.tva_intracom}` : ''}
                  </p>
                  {c.address && <p className="text-xs text-muted-foreground mt-0.5">{c.address}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => startEdit(c)}
                    className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
                    title={t('sup.edit')}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <span className="text-xs px-2 py-1 bg-success/10 text-success rounded font-medium">
                    {c.short_name}
                  </span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
