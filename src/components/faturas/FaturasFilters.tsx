import { useI18n } from '@/contexts/I18nContext';
import { useCategories } from '@/hooks/useCategories';
import { FilterBar, FilterSearch, FilterSelect, type FilterOption } from '@/components/ui/filter-bar';
import { SupplierCombobox } from './SupplierCombobox';
import { DateRangePicker } from './DateRangePicker';

export interface FaturasFilterState {
  search: string;
  year: string;
  month: string;
  dateStart: string;
  dateEnd: string;
  supplierId: string;
  category: string;
}

const EMPTY_FILTERS: FaturasFilterState = {
  search: '',
  year: '',
  month: '',
  dateStart: '',
  dateEnd: '',
  supplierId: '',
  category: '',
};

interface FaturasFiltersProps {
  filters: FaturasFilterState;
  onChange: (filters: FaturasFilterState) => void;
  tenantId: string | null;
}

const YEARS: FilterOption[] = ['2026', '2025', '2024', '2023'].map((y) => ({ value: y, label: y }));

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
  const hasDateRange = !!(filters.dateStart || filters.dateEnd);

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
          disabled={hasDateRange}
        />
        <FilterSelect
          placeholder={t('filter.month')}
          value={filters.month}
          options={months}
          onValueChange={(v) => set('month', v)}
          disabled={!filters.year || hasDateRange}
        />
        <DateRangePicker
          start={filters.dateStart}
          end={filters.dateEnd}
          onChange={({ start, end }) => onChange({ ...filters, dateStart: start, dateEnd: end })}
          startLabel={t('filter.date_from')}
          endLabel={t('filter.date_to')}
        />
        <SupplierCombobox
          value={filters.supplierId}
          onValueChange={(v) => set('supplierId', v)}
          placeholder={t('filter.supplier')}
        />
        {categories.length > 0 && (
          <FilterSelect
            placeholder={t('filter.category')}
            value={filters.category}
            options={categories.map((c) => ({ value: c.code, label: c.label }))}
            onValueChange={(v) => set('category', v)}
          />
        )}
      </FilterBar>
    </div>
  );
}
