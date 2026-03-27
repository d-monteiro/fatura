import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { useI18n } from '@/contexts/I18nContext';
import { formatEUR } from '@/lib/utils/validation';
import { Search, BadgeCheck } from 'lucide-react';
import type { Supplier } from '@/types/database';

export default function Fournisseurs() {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: suppliers, isLoading } = useQuery({
    queryKey: ['suppliers', search],
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

  const selectedSupplier = suppliers?.find((s) => s.id === selectedId);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">{t('nav.suppliers')}</h1>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder={t('action.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-gray-100" />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50 text-left">
                <th className="px-4 py-3 font-medium text-gray-500">{t('sup.name')}</th>
                <th className="px-4 py-3 font-medium text-gray-500">{t('inv.siret')}</th>
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
                  onClick={() => setSelectedId(sup.id === selectedId ? null : sup.id)}
                  className={`cursor-pointer border-b border-gray-50 transition-colors hover:bg-blue-50/50 ${
                    sup.id === selectedId ? 'bg-blue-50' : ''
                  }`}
                >
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {sup.display_name ?? sup.name}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">
                    {sup.siret ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{sup.default_metier ?? '—'}</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">
                    {formatEUR(sup.total_spent)}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">{sup.invoice_count}</td>
                  <td className="px-4 py-3">
                    {sup.is_sous_traitant && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-medium text-violet-700">
                        <BadgeCheck className="h-3.5 w-3.5" /> Sous-traitant
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {(!suppliers || suppliers.length === 0) && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-gray-400">
                    Aucun fournisseur
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* TODO: Replace with a proper drawer/modal */}
      {selectedSupplier && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-6">
          <h3 className="text-lg font-semibold text-gray-900">
            {selectedSupplier.display_name ?? selectedSupplier.name}
          </h3>
          <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">SIRET:</span>{' '}
              <span className="font-mono">{selectedSupplier.siret ?? '—'}</span>
            </div>
            <div>
              <span className="text-gray-500">IBAN:</span>{' '}
              <span className="font-mono">{selectedSupplier.iban ?? '—'}</span>
            </div>
            <div>
              <span className="text-gray-500">{t('sup.total_spent')}:</span>{' '}
              <span className="font-medium">{formatEUR(selectedSupplier.total_spent)}</span>
            </div>
            <div>
              <span className="text-gray-500">{t('sup.invoice_count')}:</span>{' '}
              <span className="font-medium">{selectedSupplier.invoice_count}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
