import { useState, useMemo, useEffect, useCallback } from 'react';
import { X, ExternalLink, Save, XCircle } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useI18n } from '@/contexts/I18nContext';
import { invalidateInvoiceLists } from '@/lib/queryKeys';
import { updateInvoiceEverywhere, type InvoicePatch } from '@/lib/sync/updateInvoice';
import { useUploadDeps } from '@/hooks/useUploadDeps';
import { useTenant } from '@/contexts/TenantContext';
import { InvoiceDocPreview } from './InvoiceDocPreview';
import { InvoiceEditFormFields } from './InvoiceEditForm';
import { InvoicePaymentStatus } from './InvoicePaymentStatus';
import type { Invoice } from '@/types/database';

interface Props { invoice: Invoice; open: boolean; onClose: () => void; }

const n = (v: number | null): string => (v != null ? String(v) : '');

export function InvoiceEditDialog({ invoice, open, onClose }: Props) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { accessToken } = useUploadDeps();
  const { tenant } = useTenant();

  const initialForm = useMemo(() => ({
    supplier_name: invoice.supplier_name ?? '', supplier_nif: invoice.supplier_nif ?? '',
    doc_number: invoice.doc_number ?? '', doc_date: invoice.doc_date ?? '',
    valor_sem_iva: n(invoice.valor_sem_iva), valor_iva: n(invoice.valor_iva),
    valor_total: n(invoice.valor_total), taxa_iva: n(invoice.taxa_iva),
    category: invoice.category ?? '', summary: invoice.summary ?? '',
  }), [invoice]);

  const [form, setForm] = useState(initialForm);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const set = (key: string, value: string) => setForm((p) => ({ ...p, [key]: value }));
  const isDirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(initialForm),
    [form, initialForm],
  );

  const tryClose = useCallback(() => {
    if (isDirty) setShowDiscardConfirm(true);
    else onClose();
  }, [isDirty, onClose]);

  const drivePreviewUrl = invoice.drive_file_id
    ? `https://drive.google.com/file/d/${invoice.drive_file_id}/preview` : null;

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

  // ESC fecha (com guard de dirty)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') tryClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, tryClose]);

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50 md:left-60" onClick={tryClose} aria-hidden="true" />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:left-60 pointer-events-none">
        <div className="relative flex h-[90vh] w-full max-w-[95vw] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl md:w-[1400px] pointer-events-auto"
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
                <button onClick={tryClose} className="rounded-lg p-1 hover:bg-gray-100"><X className="h-5 w-5" /></button>
              </div>
              <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }} className="flex flex-1 flex-col min-h-0">
                <InvoiceEditFormFields form={form} onChange={set} t={t} />
                <div className="border-t px-4 py-3 flex flex-col gap-2 bg-white">
                  <InvoicePaymentStatus invoice={invoice} />
                </div>
                <div className="border-t px-4 py-3 flex gap-2 bg-white">
                  <button type="submit" disabled={mutation.isPending || !isDirty}
                    className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:opacity-90 transition-all disabled:opacity-60">
                    <Save className="h-4 w-4" /> {mutation.isPending ? t('edit.saving') : t('action.save')}
                  </button>
                  <button type="button" onClick={tryClose}
                    className="flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
                    <XCircle className="h-4 w-4" /> {t('action.cancel')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>

      {showDiscardConfirm && (
        <>
          <div className="fixed inset-0 z-[60] bg-black/40" onClick={() => setShowDiscardConfirm(false)} />
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-semibold text-gray-900">Descartar alterações?</h3>
              <p className="mt-2 text-sm text-gray-500">As alterações que fizeste não vão ser guardadas.</p>
              <div className="mt-4 flex justify-end gap-2">
                <button onClick={() => setShowDiscardConfirm(false)}
                  className="rounded-lg border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                  Continuar a editar
                </button>
                <button onClick={() => { setShowDiscardConfirm(false); onClose(); }}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">
                  Descartar
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
