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

const METIERS: { value: Metier; label: string }[] = [
  { value: 'electricite', label: 'Electricite' },
  { value: 'plomberie', label: 'Plomberie' },
  { value: 'chauffage', label: 'Chauffage' },
  { value: 'platrerie', label: 'Platrerie' },
  { value: 'autre', label: 'Autre' },
];

const NATURES: { value: NatureDepense; label: string }[] = [
  { value: 'materiaux', label: 'Materiaux' },
  { value: 'sous_traitants', label: 'Sous-traitants' },
  { value: 'location_materiel', label: 'Location materiel' },
  { value: 'restauration', label: 'Restauration' },
  { value: 'carburant', label: 'Carburant' },
  { value: 'autre', label: 'Autre' },
];

const COST_TYPES: { value: CostType; label: string }[] = [
  { value: 'cout_fixe', label: 'Cout fixe' },
  { value: 'cout_variable', label: 'Cout variable' },
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
        <SelectFilter label="Annee" value={filters.year} options={YEARS.map((y) => ({ value: y, label: y }))} onChange={(v) => set('year', v)} />
        <SelectFilter label="Mois" value={filters.month} options={MONTHS} onChange={(v) => set('month', v)} />
        <SelectFilter label="Metier" value={filters.metier} options={METIERS} onChange={(v) => set('metier', v)} />
        <SelectFilter label="Nature" value={filters.nature} options={NATURES} onChange={(v) => set('nature', v)} />
        <SelectFilter label="Type" value={filters.costType} options={COST_TYPES} onChange={(v) => set('costType', v)} />
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
