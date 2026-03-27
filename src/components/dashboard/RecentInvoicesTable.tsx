import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { formatEUR, formatDateFR } from '@/lib/utils/validation';
import { useI18n } from '@/contexts/I18nContext';
import type { Invoice } from '@/types/database';

interface RecentInvoicesTableProps {
  companyId: string | null;
}

export function RecentInvoicesTable({ companyId }: RecentInvoicesTableProps) {
  const { t } = useI18n();
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

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
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
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="mb-4 text-lg font-semibold text-gray-900">{t('dash.recent')}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-gray-500">
              <th className="pb-3 font-medium">{t('inv.date')}</th>
              <th className="pb-3 font-medium">{t('inv.supplier')}</th>
              <th className="pb-3 font-medium">{t('inv.metier')}</th>
              <th className="pb-3 text-right font-medium">{t('inv.amount_ttc')}</th>
              <th className="pb-3 font-medium">{t('inv.status')}</th>
            </tr>
          </thead>
          <tbody>
            {invoices?.map((inv) => (
              <tr key={inv.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="py-3 text-gray-600">{formatDateFR(inv.doc_date)}</td>
                <td className="py-3 font-medium text-gray-900">{inv.supplier_name ?? '\u2014'}</td>
                <td className="py-3 text-gray-600">{inv.metier ?? '\u2014'}</td>
                <td className="py-3 text-right font-medium text-gray-900">
                  {formatEUR(inv.montant_ttc)}
                </td>
                <td className="py-3">
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
