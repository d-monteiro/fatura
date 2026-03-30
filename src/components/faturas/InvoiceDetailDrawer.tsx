import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, ExternalLink, Pencil, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useI18n } from '@/contexts/I18nContext';
import { formatEUR, formatDateFR } from '@/lib/utils/validation';
import { LineItemsTable } from './LineItemsTable';
import type { Invoice, InvoiceLineItem } from '@/types/database';

interface Props {
  invoice: Invoice | null;
  open: boolean;
  onClose: () => void;
  onEdit: (invoice: Invoice) => void;
  onDelete: (id: string) => void;
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-700',
  inbox: 'bg-blue-100 text-blue-700',
  processed: 'bg-green-100 text-green-700',
  review: 'bg-amber-100 text-amber-700',
};

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs font-medium text-gray-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-gray-900">{value || '—'}</dd>
    </div>
  );
}

export function InvoiceDetailDrawer({ invoice, open, onClose, onEdit, onDelete }: Props) {
  const { t } = useI18n();

  const { data: lineItems } = useQuery({
    queryKey: ['line-items', invoice?.id],
    enabled: !!invoice?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoice_line_items').select('*')
        .eq('invoice_id', invoice!.id).order('line_number');
      if (error) throw error;
      return data as InvoiceLineItem[];
    },
  });

  const { data: company } = useQuery({
    queryKey: ['company', invoice?.company_id],
    enabled: !!invoice?.company_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies').select('name').eq('id', invoice!.company_id).single();
      if (error) throw error;
      return data as { name: string };
    },
  });

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (open) document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [open, onClose]);

  if (!open || !invoice) return null;

  const handleDelete = () => {
    if (window.confirm(t('drawer.delete_confirm'))) onDelete(invoice.id);
  };
  const costLabel = invoice.cost_type === 'cout_fixe' ? 'Fixe' : invoice.cost_type === 'cout_variable' ? 'Variable' : null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-lg font-semibold text-gray-900">{t('drawer.title')}</h2>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-gray-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[invoice.status] ?? ''}`}>
              {t(`status.${invoice.status}` as 'status.pending')}
            </span>
            {invoice.confidence_score != null && (
              <span className="text-xs text-gray-500">{t('drawer.confidence')}: {invoice.confidence_score}%</span>
            )}
            {invoice.autoliquidation && (
              <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-medium text-orange-700">{t('inv.autoliquidation')}</span>
            )}
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Field label={t('inv.supplier')} value={invoice.supplier_name} />
            <Field label={t('drawer.company')} value={company?.name} />
            <Field label={t('inv.date')} value={formatDateFR(invoice.doc_date)} />
            <Field label={t('inv.doc_number')} value={invoice.doc_number} />
            <Field label={t('inv.amount_ht')} value={formatEUR(invoice.montant_ht)} />
            <Field label={t('inv.tva')} value={formatEUR(invoice.montant_tva)} />
            <Field label={t('inv.tva_rate')} value={invoice.taux_tva != null ? `${invoice.taux_tva}%` : null} />
            <Field label={t('inv.amount_ttc')} value={formatEUR(invoice.montant_ttc)} />
            <Field label={t('inv.metier')} value={invoice.metier} />
            <Field label={t('inv.nature')} value={invoice.nature_depense} />
            <Field label={t('inv.cost_type')} value={costLabel} />
            <Field label={t('inv.payment')} value={invoice.payment_method} />
            <Field label={t('inv.due_date')} value={formatDateFR(invoice.date_echeance)} />
            <Field label={t('drawer.iban')} value={invoice.supplier_iban} />
          </dl>
          {invoice.summary && <Field label={t('inv.summary')} value={invoice.summary} />}
          {lineItems && <LineItemsTable items={lineItems} />}
        </div>
        <div className="flex items-center gap-2 border-t px-5 py-3">
          {invoice.drive_link && (
            <a href={invoice.drive_link} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
              <ExternalLink className="h-4 w-4" /> {t('drawer.view_doc')}
            </a>
          )}
          <div className="flex-1" />
          <button onClick={() => onEdit(invoice)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
            <Pencil className="h-4 w-4" /> {t('drawer.edit')}
          </button>
          <button onClick={handleDelete}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50">
            <Trash2 className="h-4 w-4" /> {t('drawer.delete')}
          </button>
        </div>
      </div>
    </>
  );
}
