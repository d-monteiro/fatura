import { Search, X } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import type { Metier, NatureDepense, CostType } from '@/types/database';

export interface FaturasFilterState {
  search: string;
  year: string;
  month: string;
  metier: string;
  nature: string;
  costType: string;
}

interface FaturasFiltersProps {
  filters: FaturasFilterState;
  onChange: (filters: FaturasFilterState) => void;
}

const YEARS = ['2026', '2025', '2024', '2023'];

import type { TranslationKey } from '@/lib/i18n';

const METIER_KEYS: { value: Metier; key: TranslationKey }[] = [
  { value: 'electricite', key: 'cat.electricite' },
  { value: 'plomberie', key: 'cat.plomberie' },
  { value: 'chauffage', key: 'cat.chauffage' },
  { value: 'platrerie', key: 'cat.platrerie' },
  { value: 'autre', key: 'cat.autre' },
];

const NATURE_KEYS: { value: NatureDepense; key: TranslationKey }[] = [
  { value: 'materiaux', key: 'cat.materiaux' },
  { value: 'sous_traitants', key: 'cat.sous_traitants' },
  { value: 'location_materiel', key: 'cat.location_materiel' },
  { value: 'restauration', key: 'cat.restauration' },
  { value: 'carburant', key: 'cat.carburant' },
  { value: 'autre', key: 'cat.autre' },
];

const COST_TYPE_KEYS: { value: CostType; key: TranslationKey }[] = [
  { value: 'cout_fixe', key: 'cat.cout_fixe' },
  { value: 'cout_variable', key: 'cat.cout_variable' },
];

const EMPTY_FILTERS: FaturasFilterState = {
  search: '', year: '', month: '', metier: '', nature: '', costType: '',
};

export function FaturasFilters({ filters, onChange }: FaturasFiltersProps) {
  const { t } = useI18n();
  const MONTHS = Array.from({ length: 12 }, (_, i) => ({
    value: String(i + 1),
    label: t(`month.${i + 1}` as 'month.1'),
  }));
  const set = (key: keyof FaturasFilterState, value: string) =>
    onChange({ ...filters, [key]: value });

  const hasFilters = Object.values(filters).some((v) => v !== '');

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder={t('action.search')}
          value={filters.search}
          onChange={(e) => set('search', e.target.value)}
          className="min-h-[44px] w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* Filter dropdowns */}
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <SelectFilter label={t('filter.year')} value={filters.year} options={YEARS.map((y) => ({ value: y, label: y }))} onChange={(v) => set('year', v)} />
        <SelectFilter label={t('filter.month')} value={filters.month} options={MONTHS} onChange={(v) => set('month', v)} />
        <SelectFilter label={t('filter.metier')} value={filters.metier} options={METIER_KEYS.map((m) => ({ value: m.value, label: t(m.key) }))} onChange={(v) => set('metier', v)} />
        <SelectFilter label={t('filter.nature')} value={filters.nature} options={NATURE_KEYS.map((n) => ({ value: n.value, label: t(n.key) }))} onChange={(v) => set('nature', v)} />
        <SelectFilter label={t('filter.cost_type')} value={filters.costType} options={COST_TYPE_KEYS.map((c) => ({ value: c.value, label: t(c.key) }))} onChange={(v) => set('costType', v)} />
        {hasFilters && (
          <button
            onClick={() => onChange(EMPTY_FILTERS)}
            className="col-span-2 inline-flex items-center justify-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 sm:py-1.5"
          >
            <X className="h-3 w-3" /> {t('action.clear_filters')}
          </button>
        )}
      </div>
    </div>
  );
}

function SelectFilter({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="min-h-[44px] w-full rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-700 focus:border-blue-500 focus:outline-none sm:min-h-0 sm:w-auto sm:py-1.5"
    >
      <option value="">{label}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}
