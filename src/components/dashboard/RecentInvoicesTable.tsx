import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase/client';
import { formatEUR, formatDateFR } from '@/lib/utils/validation';
import { useI18n } from '@/contexts/I18nContext';
import type { Invoice } from '@/types/database';

interface RecentInvoicesTableProps {
  companyId: string | null;
}

export function RecentInvoicesTable({ companyId }: RecentInvoicesTableProps) {
  const { t } = useI18n();
  const navigate = useNavigate();

  const { data: invoices, isLoading } = useQuery({
    queryKey: ['recent-invoices', companyId],
    queryFn: async () => {
      let query = supabase
        .from('invoices')
        .select('id, doc_date, supplier_name, metier, nature_depense, montant_ttc, status')
        .is('deleted_at', null)
        .order('doc_date', { ascending: false })
        .limit(5);

      if (companyId) {
        query = query.eq('company_id', companyId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Pick<Invoice, 'id' | 'doc_date' | 'supplier_name' | 'metier' | 'nature_depense' | 'montant_ttc' | 'status'>[];
    },
  });

  const handleRowClick = (invoiceId: string) => {
    navigate('/invoices', { state: { invoiceId } });
  };

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">{t('dash.recent')}</h3>
        <div className="animate-pulse space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-10 rounded bg-gray-100" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
      <h3 className="mb-4 text-lg font-semibold text-gray-900">{t('dash.recent')}</h3>
      <div className="overflow-x-auto -mx-4 sm:mx-0">
        <table className="w-full min-w-[600px] text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-gray-500">
              <th className="px-4 pb-3 font-medium sm:px-0">{t('inv.date')}</th>
              <th className="px-4 pb-3 font-medium sm:px-0">{t('inv.supplier')}</th>
              <th className="hidden pb-3 font-medium sm:table-cell">{t('inv.metier')}</th>
              <th className="px-4 pb-3 text-right font-medium sm:px-0">{t('inv.amount_ttc')}</th>
              <th className="px-4 pb-3 font-medium sm:px-0">{t('inv.status')}</th>
            </tr>
          </thead>
          <tbody>
            {invoices?.map((inv) => (
              <tr
                key={inv.id}
                onClick={() => handleRowClick(inv.id)}
                className="cursor-pointer border-b border-gray-50 hover:bg-blue-50/50"
              >
                <td className="px-4 py-3 text-gray-600 sm:px-0">{formatDateFR(inv.doc_date)}</td>
                <td className="px-4 py-3 font-medium text-gray-900 sm:px-0">{inv.supplier_name ?? '\u2014'}</td>
                <td className="hidden py-3 text-gray-600 sm:table-cell">{inv.metier ?? '\u2014'}</td>
                <td className="px-4 py-3 text-right font-medium text-gray-900 sm:px-0">
                  {formatEUR(inv.montant_ttc)}
                </td>
                <td className="px-4 py-3 sm:px-0">
                  <StatusBadge status={inv.status} />
                </td>
              </tr>
            ))}
            {(!invoices || invoices.length === 0) && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-gray-400">
                  Aucune facture
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useI18n();
  const styles: Record<string, string> = {
    processed: 'bg-green-100 text-green-700',
    review: 'bg-amber-100 text-amber-700',
    inbox: 'bg-blue-100 text-blue-700',
    pending: 'bg-gray-100 text-gray-600',
  };
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status] ?? styles.pending}`}>
      {t(`status.${status}` as 'status.pending')}
    </span>
  );
}
