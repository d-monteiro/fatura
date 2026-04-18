import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { useI18n } from '@/contexts/I18nContext';
import { formatEUR, formatDatePT } from '@/lib/utils/validation';
import { X, BadgeCheck, Pencil } from 'lucide-react';
import { SupplierEditForm } from './SupplierEditForm';
import type { Supplier, Invoice } from '@/types/database';

interface Props {
  supplier: Supplier;
  onClose: () => void;
  onUpdated: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  processed: 'bg-green-100 text-green-700',
  inbox: 'bg-blue-100 text-blue-700',
  review: 'bg-amber-100 text-amber-700',
  pending: 'bg-gray-100 text-gray-600',
};

export function SupplierDetailModal({ supplier, onClose, onUpdated }: Props) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const { data: invoices } = useQuery({
    queryKey: ['supplier-invoices', supplier.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select('id, doc_date, doc_number, montant_ttc, status')
        .eq('supplier_id', supplier.id)
        .is('deleted_at', null)
        .order('doc_date', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data as Pick<Invoice, 'id' | 'doc_date' | 'doc_number' | 'montant_ttc' | 'status'>[];
    },
  });

  const handleSaved = () => {
    setEditing(false);
    onUpdated();
  };

  const fields = [
    { label: t('inv.nif'), value: supplier.nif, mono: true },
    { label: t('sup.iban'), value: supplier.iban, mono: true },
    { label: t('sup.address'), value: supplier.address },
    { label: t('sup.total_spent'), value: formatEUR(supplier.total_spent) },
    { label: t('sup.invoice_count'), value: String(supplier.invoice_count) },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="relative mx-4 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              {supplier.display_name ?? supplier.name}
            </h2>
            {supplier.is_subcontractor && (
              <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-medium text-violet-700">
                <BadgeCheck className="h-3.5 w-3.5" /> {t('sup.subcontractor')}
              </span>
            )}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {editing ? (
          <SupplierEditForm supplier={supplier} onCancel={() => setEditing(false)} onSaved={handleSaved} />
        ) : (
          <>
            {/* Fields grid */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              {fields.map((f) => (
                <div key={f.label}>
                  <span className="text-gray-500">{f.label}:</span>{' '}
                  <span className={f.mono ? 'font-mono text-xs' : 'font-medium'}>{f.value ?? '---'}</span>
                </div>
              ))}
            </div>

            <button
              onClick={() => setEditing(true)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Pencil className="h-4 w-4" /> {t('sup.edit')}
            </button>

            {/* Recent invoices */}
            <h3 className="mt-6 mb-3 text-sm font-semibold text-gray-700">{t('sup.recent_invoices')}</h3>
            {(!invoices || invoices.length === 0) ? (
              <p className="text-sm text-gray-400">{t('sup.no_invoices')}</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50/50 text-left">
                      <th className="px-3 py-2 font-medium text-gray-500">{t('inv.date')}</th>
                      <th className="px-3 py-2 font-medium text-gray-500">{t('inv.doc_number')}</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-500">{t('inv.amount_ttc')}</th>
                      <th className="px-3 py-2 font-medium text-gray-500">{t('inv.status')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv) => (
                      <tr key={inv.id} className="border-b border-gray-50">
                        <td className="px-3 py-2 text-gray-600">{formatDatePT(inv.doc_date)}</td>
                        <td className="px-3 py-2 font-mono text-xs text-gray-600">{inv.doc_number ?? '---'}</td>
                        <td className="px-3 py-2 text-right font-medium">{formatEUR(inv.montant_ttc)}</td>
                        <td className="px-3 py-2">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[inv.status] ?? ''}`}>
                            {t(`status.${inv.status}` as 'status.pending')}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
