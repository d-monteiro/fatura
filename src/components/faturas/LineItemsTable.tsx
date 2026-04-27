import { formatEUR } from '@/lib/utils/validation';
import { useI18n } from '@/contexts/I18nContext';
import type { InvoiceLineItem } from '@/types/database';

interface Props {
  items: InvoiceLineItem[];
}

export function LineItemsTable({ items }: Props) {
  const { t } = useI18n();

  if (items.length === 0) {
    return <p className="text-xs text-gray-400">{t('drawer.no_items')}</p>;
  }

  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-gray-700">{t('inv.line_items')}</h3>
      <div className="overflow-x-auto rounded-lg border text-xs">
        <table className="w-full">
          <thead><tr className="bg-gray-50 text-left">
            <th className="px-2 py-1.5">Descrição</th>
            <th className="px-2 py-1.5 text-right">Qtd.</th>
            <th className="px-2 py-1.5 text-right">Preço unitário</th>
            <th className="px-2 py-1.5 text-right">Total s/ IVA</th>
          </tr></thead>
          <tbody>
            {items.map((li) => (
              <tr key={li.id} className="border-t">
                <td className="px-2 py-1.5">{li.description ?? '—'}</td>
                <td className="px-2 py-1.5 text-right">{li.quantity ?? '—'}{li.unit ? ` ${li.unit}` : ''}</td>
                <td className="px-2 py-1.5 text-right">{formatEUR(li.preco_unitario)}</td>
                <td className="px-2 py-1.5 text-right">{formatEUR(li.total_sem_iva)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
