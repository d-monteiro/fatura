import { useI18n } from '@/contexts/I18nContext';
import { useCategories } from '@/hooks/useCategories';
import { useTenant } from '@/contexts/TenantContext';
import { FilterBar, FilterSearch, FilterSelect, type FilterOption } from '@/components/ui/filter-bar';
import { SupplierCombobox } from './SupplierCombobox';
import { DateRangePicker } from './DateRangePicker';
import { DOCUMENT_TYPE_LABEL, type DocumentType } from '@/types/database';

export interface FaturasFilterState {
  search: string;
  year: string;
  month: string;
  dateStart: string;
  dateEnd: string;
  supplierId: string;
  category: string;
  documentType: string;
}

const EMPTY_FILTERS: FaturasFilterState = {
  search: '',
  year: '',
  month: '',
  dateStart: '',
  dateEnd: '',
  supplierId: '',
  category: '',
  documentType: '',
};

interface FaturasFiltersProps {
  filters: FaturasFilterState;
  onChange: (filters: FaturasFilterState) => void;
  tenantId: string | null;
}

// Janela rolante: ano corrente + 4 anos anteriores. Deixa de ficar
// desactualizado quando vira o ano sem ninguém mexer.
const YEAR_OPTIONS = ((): FilterOption[] => {
  const current = new Date().getFullYear();
  return Array.from({ length: 5 }, (_, i) => {
    const y = String(current - i);
    return { value: y, label: y };
  });
})();

export function FaturasFilters({ filters, onChange, tenantId }: FaturasFiltersProps) {
  const { t } = useI18n();
  const { categories } = useCategories(tenantId);
  const { tenant } = useTenant();
  const months: FilterOption[] = Array.from({ length: 12 }, (_, i) => ({
    value: String(i + 1),
    label: t(`month.${i + 1}` as 'month.1'),
  }));
  const allowedTypes = (tenant?.allowed_document_types ?? []) as DocumentType[];
  const docTypeOptions: FilterOption[] = allowedTypes
    .filter((dt): dt is DocumentType => dt in DOCUMENT_TYPE_LABEL)
    .map((dt) => ({ value: dt, label: DOCUMENT_TYPE_LABEL[dt] }));
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
          options={YEAR_OPTIONS}
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
        {docTypeOptions.length > 0 && (
          <FilterSelect
            placeholder="Tipo"
            value={filters.documentType}
            options={docTypeOptions}
            onValueChange={(v) => set('documentType', v)}
          />
        )}
      </FilterBar>
    </div>
  );
}
