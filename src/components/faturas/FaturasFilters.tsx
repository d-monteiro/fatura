import { useI18n } from '@/contexts/I18nContext';
import { useCategories } from '@/hooks/useCategories';
import { FilterBar, FilterSearch, FilterSelect, type FilterOption } from '@/components/ui/filter-bar';

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
  tenantId: string | null;
}

const YEARS: FilterOption[] = ['2026', '2025', '2024', '2023'].map((y) => ({ value: y, label: y }));

const EMPTY_FILTERS: FaturasFilterState = {
  search: '', year: '', month: '', metier: '', nature: '', costType: '',
};

export function FaturasFilters({ filters, onChange, tenantId }: FaturasFiltersProps) {
  const { t } = useI18n();
  const { categories } = useCategories(tenantId);
  const months: FilterOption[] = Array.from({ length: 12 }, (_, i) => ({
    value: String(i + 1),
    label: t(`month.${i + 1}` as 'month.1'),
  }));
  const set = (key: keyof FaturasFilterState, value: string) =>
    onChange({ ...filters, [key]: value });

  const hasFilters = Object.values(filters).some((v) => v !== '');

  return (
    <div className="space-y-3">
      <FilterSearch
        value={filters.search}
        onValueChange={(v) => set('search', v)}
        placeholder={t('action.search')}
      />

      <FilterBar
        hasActive={hasFilters}
        onClear={() => onChange(EMPTY_FILTERS)}
        clearLabel={t('action.clear_filters')}
      >
        <FilterSelect
          placeholder={t('filter.year')}
          value={filters.year}
          options={YEARS}
          onValueChange={(v) => set('year', v)}
          allOptionLabel={t('filter.year')}
        />
        <FilterSelect
          placeholder={t('filter.month')}
          value={filters.month}
          options={months}
          onValueChange={(v) => set('month', v)}
          allOptionLabel={t('filter.month')}
        />
        {categories.metier.length > 0 && (
          <FilterSelect
            placeholder={t('filter.metier')}
            value={filters.metier}
            options={categories.metier.map((c) => ({ value: c.code, label: c.label }))}
            onValueChange={(v) => set('metier', v)}
            allOptionLabel={t('filter.metier')}
          />
        )}
        <FilterSelect
          placeholder={t('filter.nature')}
          value={filters.nature}
          options={categories.nature_depense.map((c) => ({ value: c.code, label: c.label }))}
          onValueChange={(v) => set('nature', v)}
          allOptionLabel={t('filter.nature')}
        />
        <FilterSelect
          placeholder={t('filter.cost_type')}
          value={filters.costType}
          options={categories.cost_type.map((c) => ({ value: c.code, label: c.label }))}
          onValueChange={(v) => set('costType', v)}
          allOptionLabel={t('filter.cost_type')}
        />
      </FilterBar>
    </div>
  );
}
