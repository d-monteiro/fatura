import type { TranslationKey } from '@/lib/i18n';
import type { Metier, NatureDepense, CostType } from '@/types/database';

type TFn = (key: TranslationKey) => string;

interface FormData {
  supplier_name: string; supplier_siret: string; doc_number: string; doc_date: string;
  montant_ht: string; montant_tva: string; montant_ttc: string; taux_tva: string;
  metier: string; nature_depense: string; cost_type: string; summary: string;
}

interface Props {
  form: FormData;
  onChange: (key: string, value: string) => void;
  t: TFn;
}

const METIERS: Metier[] = ['electricite', 'plomberie', 'chauffage', 'platrerie', 'autre'];
const NATURES: NatureDepense[] = [
  'materiaux', 'sous_traitants', 'location_materiel', 'restauration',
  'carburant', 'atelier', 'assurances', 'comptabilite', 'fournitures_bureau', 'autre',
];
const COST_TYPES: CostType[] = ['cout_fixe', 'cout_variable'];
const cls = 'w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';

export type { FormData as InvoiceEditFormData };

export function InvoiceEditFormFields({ form, onChange, t }: Props) {
  const set = onChange;
  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5 min-h-0">
      <label className="block space-y-1">
        <span className="text-xs font-medium text-gray-600">{t('inv.supplier')}</span>
        <input className={cls} value={form.supplier_name} onChange={(e) => set('supplier_name', e.target.value)} />
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-gray-600">{t('inv.siret')}</span>
        <input className={cls} value={form.supplier_siret} onChange={(e) => set('supplier_siret', e.target.value)} />
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-gray-600">{t('inv.doc_number')}</span>
        <input className={cls} value={form.doc_number} onChange={(e) => set('doc_number', e.target.value)} />
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-gray-600">{t('inv.date')}</span>
        <input type="date" className={cls} value={form.doc_date} onChange={(e) => set('doc_date', e.target.value)} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <span className="text-xs font-medium text-gray-600">{t('inv.amount_ht')}</span>
          <input type="number" step="0.01" className={cls} value={form.montant_ht} onChange={(e) => set('montant_ht', e.target.value)} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-gray-600">{t('inv.tva')}</span>
          <input type="number" step="0.01" className={cls} value={form.montant_tva} onChange={(e) => set('montant_tva', e.target.value)} />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <span className="text-xs font-medium text-gray-600">{t('inv.amount_ttc')}</span>
          <input type="number" step="0.01" className={cls} value={form.montant_ttc} onChange={(e) => set('montant_ttc', e.target.value)} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-gray-600">{t('inv.tva_rate')} (%)</span>
          <input type="number" step="0.1" className={cls} value={form.taux_tva} onChange={(e) => set('taux_tva', e.target.value)} />
        </label>
      </div>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-gray-600">{t('inv.metier')}</span>
        <select className={cls} value={form.metier} onChange={(e) => set('metier', e.target.value)}>
          <option value="">--</option>
          {METIERS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-gray-600">{t('inv.nature')}</span>
        <select className={cls} value={form.nature_depense} onChange={(e) => set('nature_depense', e.target.value)}>
          <option value="">--</option>
          {NATURES.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-gray-600">{t('inv.cost_type')}</span>
        <select className={cls} value={form.cost_type} onChange={(e) => set('cost_type', e.target.value)}>
          <option value="">--</option>
          {COST_TYPES.map((c) => <option key={c} value={c}>{c === 'cout_fixe' ? 'Fixe' : 'Variable'}</option>)}
        </select>
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-gray-600">{t('inv.summary')}</span>
        <input className={cls} value={form.summary} onChange={(e) => set('summary', e.target.value)} />
      </label>
    </div>
  );
}
