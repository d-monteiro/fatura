import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { useI18n } from '@/contexts/I18nContext';
import type { Supplier, Metier, NatureDepense, CostType } from '@/types/database';
import { METIERS, NATURES, COST_TYPES } from '@/lib/constants';

interface Props {
  supplier: Supplier;
  onCancel: () => void;
  onSaved: () => void;
}

export function SupplierEditForm({ supplier, onCancel, onSaved }: Props) {
  const { t } = useI18n();
  const [form, setForm] = useState({
    name: supplier.display_name ?? supplier.name,
    siret: supplier.siret ?? '',
    tva_intracom: supplier.tva_intracom ?? '',
    iban: supplier.iban ?? '',
    address: supplier.address ?? '',
    default_metier: supplier.default_metier ?? '',
    default_nature: supplier.default_nature ?? '',
    default_cost_type: supplier.default_cost_type ?? '',
    is_sous_traitant: supplier.is_sous_traitant,
  });
  const [error, setError] = useState('');

  const update = (field: string, value: string | boolean) => setForm((p) => ({ ...p, [field]: value }));

  const mutation = useMutation({
    mutationFn: async () => {
      const siretClean = form.siret.replace(/\s/g, '');
      if (siretClean && !/^\d{14}$/.test(siretClean)) throw new Error(t('sup.siret_invalid'));

      const { error: dbErr } = await supabase
        .from('suppliers')
        .update({
          display_name: form.name || null,
          siret: siretClean || null,
          tva_intracom: form.tva_intracom || null,
          iban: form.iban || null,
          address: form.address || null,
          default_metier: (form.default_metier as Metier) || null,
          default_nature: (form.default_nature as NatureDepense) || null,
          default_cost_type: (form.default_cost_type as CostType) || null,
          is_sous_traitant: form.is_sous_traitant,
          updated_at: new Date().toISOString(),
        })
        .eq('id', supplier.id);
      if (dbErr) throw dbErr;
    },
    onSuccess: onSaved,
    onError: (e: Error) => setError(e.message),
  });

  const iCls = 'w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';
  const lCls = 'block text-xs font-medium text-gray-500 mb-1';

  const Field = ({ label, field, mono }: { label: string; field: string; mono?: boolean }) => (
    <div>
      <label className={lCls}>{label}</label>
      <input className={`${iCls}${mono ? ' font-mono' : ''}`} value={(form as Record<string, string | boolean>)[field] as string} onChange={(e) => update(field, e.target.value)} />
    </div>
  );

  const Sel = ({ label, field, opts }: { label: string; field: string; opts: string[] }) => (
    <div>
      <label className={lCls}>{label}</label>
      <select className={iCls} value={(form as Record<string, string | boolean>)[field] as string} onChange={(e) => update(field, e.target.value)}>
        <option value="">---</option>
        {opts.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('sup.name')} field="name" />
        <Field label={t('inv.nif')} field="siret" mono />
        <Field label={t('sup.tva_intracom')} field="tva_intracom" mono />
        <Field label={t('sup.iban')} field="iban" mono />
        <div className="col-span-2"><Field label={t('sup.address')} field="address" /></div>
        <Sel label={t('inv.metier')} field="default_metier" opts={[...METIERS]} />
        <Sel label={t('inv.nature')} field="default_nature" opts={[...NATURES]} />
        <Sel label={t('inv.cost_type')} field="default_cost_type" opts={[...COST_TYPES]} />
        <div className="flex items-end pb-1">
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={form.is_sous_traitant} onChange={(e) => update('is_sous_traitant', e.target.checked)} className="rounded" />
            {t('sup.subcontractor')}
          </label>
        </div>
      </div>
      <div className="flex gap-2 pt-2">
        <button onClick={() => mutation.mutate()} disabled={mutation.isPending} className="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:opacity-90 transition-all disabled:opacity-50">
          {mutation.isPending ? '...' : t('action.save')}
        </button>
        <button onClick={onCancel} className="rounded-lg border border-gray-300 px-4 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
          {t('action.cancel')}
        </button>
      </div>
    </div>
  );
}
