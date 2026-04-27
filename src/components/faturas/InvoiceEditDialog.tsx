import { useState } from 'react';
import { X, ExternalLink, Save, XCircle, Check, RotateCcw } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useI18n } from '@/contexts/I18nContext';
import { invalidateInvoiceLists } from '@/lib/queryKeys';
import { updateInvoiceEverywhere, type InvoicePatch } from '@/lib/sync/updateInvoice';
import { setInvoicePaid } from '@/lib/invoices/markAsPaid';
import { formatDatePT } from '@/lib/utils/validation';
import { useUploadDeps } from '@/hooks/useUploadDeps';
import { useTenant } from '@/contexts/TenantContext';
import { InvoiceDocPreview } from './InvoiceDocPreview';
import { InvoiceEditFormFields } from './InvoiceEditForm';
import type { Invoice } from '@/types/database';

interface Props { invoice: Invoice; open: boolean; onClose: () => void; }

const n = (v: number | null): string => (v != null ? String(v) : '');

function PaymentStatus({
  invoice, loading, onToggle,
}: { invoice: Invoice; loading: boolean; onToggle: (paid: boolean) => void }) {
  const isPaid = !!invoice.paid_at;
  return (
    <div className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${isPaid ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`}>
      <div>
        <p className={`font-medium ${isPaid ? 'text-green-800' : 'text-amber-900'}`}>
          {isPaid ? 'Paga' : 'Por pagar'}
        </p>
        {isPaid && invoice.paid_at && (
          <p className="text-xs text-green-700">em {formatDatePT(invoice.paid_at.slice(0, 10))}</p>
        )}
        {!isPaid && invoice.data_vencimento && (
          <p className="text-xs text-amber-700">vence {formatDatePT(invoice.data_vencimento)}</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => onToggle(!isPaid)}
        disabled={loading}
        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 ${isPaid ? 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50' : 'bg-green-600 text-white hover:bg-green-700'}`}
      >
        {isPaid ? <><RotateCcw className="h-3.5 w-3.5" /> Desmarcar</> : <><Check className="h-3.5 w-3.5" /> Marcar pago</>}
      </button>
    </div>
  );
}

export function InvoiceEditDialog({ invoice, open, onClose }: Props) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { accessToken } = useUploadDeps();
  const { tenant } = useTenant();
  const [form, setForm] = useState({
    supplier_name: invoice.supplier_name ?? '', supplier_nif: invoice.supplier_nif ?? '',
    doc_number: invoice.doc_number ?? '', doc_date: invoice.doc_date ?? '',
    valor_sem_iva: n(invoice.valor_sem_iva), valor_iva: n(invoice.valor_iva),
    valor_total: n(invoice.valor_total), taxa_iva: n(invoice.taxa_iva),
    category: invoice.category ?? '', summary: invoice.summary ?? '',
  });
  const set = (key: string, value: string) => setForm((p) => ({ ...p, [key]: value }));

  const drivePreviewUrl = invoice.drive_file_id
    ? `https://drive.google.com/file/d/${invoice.drive_file_id}/preview` : null;

  const paidMutation = useMutation({
    mutationKey: ['invoice-paid', invoice.id],
    mutationFn: (paid: boolean) => setInvoicePaid(invoice.id, paid),
    onSuccess: (_, paid) => {
      invalidateInvoiceLists(qc);
      toast.success(paid ? 'Fatura marcada como paga.' : 'Fatura marcada como por pagar.');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Erro a atualizar pagamento'),
  });

  const mutation = useMutation({
    mutationKey: ['invoice-edit', invoice.id],
    mutationFn: async () => {
      const pf = (v: string) => (v ? parseFloat(v) : null);
      const updates: InvoicePatch = {
        supplier_name: form.supplier_name || null,
        supplier_nif: form.supplier_nif || null,
        doc_number: form.doc_number || null,
        doc_date: form.doc_date || null,
        valor_sem_iva: pf(form.valor_sem_iva),
        valor_iva: pf(form.valor_iva),
        valor_total: pf(form.valor_total),
        taxa_iva: pf(form.taxa_iva),
        category: form.category || null,
        summary: form.summary || null,
      };
      const res = await updateInvoiceEverywhere({
        invoice, updates, accessToken, language: tenant?.language ?? 'pt',
      });
      if (!res.success) throw new Error(res.error ?? 'Erro a guardar');
      return res;
    },
    onSuccess: (res) => {
      invalidateInvoiceLists(qc);
      if (res.warning) toast.warning(res.warning);
      else toast.success('Fatura atualizada.');
      onClose();
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Erro a guardar');
    },
  });

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50 md:left-60" onClick={onClose} aria-hidden="true" />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:left-60">
        <div className="relative flex h-[90vh] w-full max-w-[95vw] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl md:w-[1400px]"
          onClick={(e) => e.stopPropagation()}>
          <div className="flex flex-1 flex-col md:flex-row min-h-0">
            <div className="hidden md:flex flex-1 bg-gray-50 border-r min-h-0">
              <InvoiceDocPreview invoice={invoice} />
            </div>
            <div className="flex w-full flex-col md:w-[400px] min-h-0 flex-1 md:flex-none">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-semibold text-gray-900">{t('edit.title')}</h2>
                  <p className="text-sm text-gray-500 truncate">{invoice.supplier_name}</p>
                  {drivePreviewUrl && (
                    <button onClick={() => window.open(invoice.drive_link || drivePreviewUrl, '_blank')}
                      className="mt-2 inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 md:hidden">
                      <ExternalLink className="h-4 w-4" /> {t('drawer.view_doc')}
                    </button>
                  )}
                </div>
                <button onClick={onClose} className="rounded-lg p-1 hover:bg-gray-100"><X className="h-5 w-5" /></button>
              </div>
              <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }} className="flex flex-1 flex-col min-h-0">
                <InvoiceEditFormFields form={form} onChange={set} t={t} />
                <div className="border-t px-4 py-3 flex flex-col gap-2 bg-white">
                  <PaymentStatus
                    invoice={invoice}
                    loading={paidMutation.isPending}
                    onToggle={(paid) => paidMutation.mutate(paid)}
                  />
                </div>
                <div className="border-t px-4 py-3 flex gap-2 bg-white">
                  <button type="submit" disabled={mutation.isPending}
                    className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:opacity-90 transition-all disabled:opacity-60">
                    <Save className="h-4 w-4" /> {mutation.isPending ? t('edit.saving') : t('action.save')}
                  </button>
                  <button type="button" onClick={onClose}
                    className="flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
                    <XCircle className="h-4 w-4" /> {t('action.cancel')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
