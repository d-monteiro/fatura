import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { useI18n } from '@/contexts/I18nContext';
import { formatEUR } from '@/lib/utils/validation';
import { Search, BadgeCheck } from 'lucide-react';
import { SupplierDetailModal } from '@/components/fornecedores/SupplierDetailModal';
import type { Supplier } from '@/types/database';
import { queryKeys } from '@/lib/queryKeys';

export default function Fornecedores() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);

  const { data: suppliers, isLoading } = useQuery({
    queryKey: queryKeys.suppliersSearch(search),
    queryFn: async () => {
      let query = supabase
        .from('suppliers')
        .select('*')
        .order('total_spent', { ascending: false });

      if (search) {
        query = query.ilike('name', `%${search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Supplier[];
    },
  });

  const handleRowClick = (sup: Supplier) => {
    setSelectedSupplier(sup);
  };

  const handleUpdated = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.suppliers });
    // Refresh modal with updated data
    if (selectedSupplier) {
      const fresh = suppliers?.find((s) => s.id === selectedSupplier.id);
      if (fresh) setSelectedSupplier(fresh);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">{t('nav.suppliers')}</h1>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder={t('action.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-h-[44px] w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-gray-100" />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gray-200/80 bg-white shadow-card -mx-4 sm:mx-0">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50 text-left">
                <th className="px-4 py-3 font-medium text-gray-500">{t('sup.name')}</th>
                <th className="px-4 py-3 font-medium text-gray-500">{t('inv.nif')}</th>
                <th className="px-4 py-3 font-medium text-gray-500">{t('inv.metier')}</th>
                <th className="px-4 py-3 text-right font-medium text-gray-500">{t('sup.total_spent')}</th>
                <th className="px-4 py-3 text-right font-medium text-gray-500">{t('sup.invoice_count')}</th>
                <th className="px-4 py-3 font-medium text-gray-500">{t('sup.subcontractor')}</th>
              </tr>
            </thead>
            <tbody>
              {suppliers?.map((sup) => (
                <tr
                  key={sup.id}
                  onClick={() => handleRowClick(sup)}
                  className="cursor-pointer border-b border-gray-50 transition-all duration-150 hover:bg-blue-50/60 hover:shadow-sm"
                >
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {sup.display_name ?? sup.name}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">
                    {sup.siret ?? '---'}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{sup.default_metier ?? '---'}</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">
                    {formatEUR(sup.total_spent)}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">{sup.invoice_count}</td>
                  <td className="px-4 py-3">
                    {sup.is_sous_traitant && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-medium text-violet-700">
                        <BadgeCheck className="h-3.5 w-3.5" /> {t('sup.sous_traitant')}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {(!suppliers || suppliers.length === 0) && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-gray-400">
                    {t('sup.none')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {selectedSupplier && (
        <SupplierDetailModal
          supplier={selectedSupplier}
          onClose={() => setSelectedSupplier(null)}
          onUpdated={handleUpdated}
        />
      )}
    </div>
  );
}
