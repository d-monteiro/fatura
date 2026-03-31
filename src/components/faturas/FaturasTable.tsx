import { ChevronUp, ChevronDown } from 'lucide-react';
import { formatEUR, formatDateFR } from '@/lib/utils/validation';
import { useI18n } from '@/contexts/I18nContext';
import { useIsMobile } from '@/hooks/useIsMobile';
import { MobileInvoiceCard } from './MobileInvoiceCard';
import type { Invoice } from '@/types/database';

export type SortField = 'doc_date' | 'supplier_name' | 'metier' | 'nature_depense' | 'cost_type' | 'montant_ttc';
export type SortDir = 'asc' | 'desc';

interface FaturasTableProps {
  invoices: Invoice[];
  sortField: SortField;
  sortDir: SortDir;
  onSort: (field: SortField) => void;
  onRowClick: (invoice: Invoice) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleAll: () => void;
}

const COLUMNS: { field: SortField; label: string; align?: 'right' }[] = [
  { field: 'doc_date', label: 'inv.date' },
  { field: 'supplier_name', label: 'inv.supplier' },
  { field: 'metier', label: 'inv.metier' },
  { field: 'nature_depense', label: 'inv.nature' },
  { field: 'cost_type', label: 'inv.cost_type' },
  { field: 'montant_ttc', label: 'inv.amount_ttc', align: 'right' },
];

export function FaturasTable({
  invoices, sortField, sortDir, onSort, onRowClick,
  selectedIds, onToggleSelect, onToggleAll,
}: FaturasTableProps) {
  const { t } = useI18n();
  const isMobile = useIsMobile();
  const allSelected = invoices.length > 0 && invoices.every((inv) => selectedIds.has(inv.id));

  // Mobile card view
  if (isMobile) {
    return (
      <div className="space-y-3">
        {invoices.length === 0 ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-gray-400">
            {t('inbox.empty')}
          </div>
        ) : (
          invoices.map((inv) => (
            <MobileInvoiceCard key={inv.id} invoice={inv} onClick={() => onRowClick(inv)} />
          ))
        )}
      </div>
    );
  }

  // Desktop table view
  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-200/80 bg-white shadow-card -mx-4 sm:mx-0">
      <table className="w-full min-w-[700px] text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50/50">
            <th className="w-10 px-3 py-3">
              <input type="checkbox" checked={allSelected} onChange={onToggleAll}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            </th>
            {COLUMNS.map((col) => (
              <th key={col.field} onClick={() => onSort(col.field)}
                className={`cursor-pointer px-4 py-3 font-medium text-gray-500 select-none hover:text-gray-700 ${col.align === 'right' ? 'text-right' : 'text-left'}`}>
                <span className="inline-flex items-center gap-1">
                  {t(col.label as 'inv.date')}
                  {sortField === col.field && (
                    sortDir === 'asc' ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv) => (
            <tr key={inv.id}
              className={`cursor-pointer border-b border-gray-50 transition-all duration-150 hover:bg-blue-50/60 hover:shadow-sm ${selectedIds.has(inv.id) ? 'bg-blue-50' : ''}`}>
              <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                <input type="checkbox" checked={selectedIds.has(inv.id)}
                  onChange={() => onToggleSelect(inv.id)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
              </td>
              <td className="px-4 py-3 text-gray-600" onClick={() => onRowClick(inv)}>{formatDateFR(inv.doc_date)}</td>
              <td className="px-4 py-3 font-medium text-gray-900" onClick={() => onRowClick(inv)}>{inv.supplier_name ?? '\u2014'}</td>
              <td className="px-4 py-3 text-gray-600" onClick={() => onRowClick(inv)}>{inv.metier ?? '\u2014'}</td>
              <td className="px-4 py-3 text-gray-600" onClick={() => onRowClick(inv)}>{inv.nature_depense ?? '\u2014'}</td>
              <td className="px-4 py-3 text-gray-600" onClick={() => onRowClick(inv)}>
                {inv.cost_type === 'cout_fixe' ? 'Fixe' : inv.cost_type === 'cout_variable' ? 'Variable' : '\u2014'}
              </td>
              <td className="px-4 py-3 text-right font-medium text-gray-900" onClick={() => onRowClick(inv)}>
                {formatEUR(inv.montant_ttc)}
              </td>
            </tr>
          ))}
          {invoices.length === 0 && (
            <tr><td colSpan={7} className="py-12 text-center text-gray-400">{t('inbox.empty')}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
