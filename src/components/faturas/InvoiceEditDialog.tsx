import { useState } from 'react';
import { X, ExternalLink, Save, XCircle } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { useI18n } from '@/contexts/I18nContext';
import { invalidateInvoiceLists } from '@/lib/queryKeys';
import { InvoiceDocPreview } from './InvoiceDocPreview';
import { InvoiceEditFormFields } from './InvoiceEditForm';
import type { Invoice } from '@/types/database';

interface Props { invoice: Invoice; open: boolean; onClose: () => void; }

const n = (v: number | null): string => (v != null ? String(v) : '');

export function InvoiceEditDialog({ invoice, open, onClose }: Props) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    supplier_name: invoice.supplier_name ?? '', supplier_nif: invoice.supplier_nif ?? '',
    doc_number: invoice.doc_number ?? '', doc_date: invoice.doc_date ?? '',
    montant_ht: n(invoice.montant_ht), montant_tva: n(invoice.montant_tva),
    montant_ttc: n(invoice.montant_ttc), taux_tva: n(invoice.taux_tva),
    metier: invoice.metier ?? '', nature_depense: invoice.nature_depense ?? '',
    cost_type: invoice.cost_type ?? '', summary: invoice.summary ?? '',
  });
  const set = (key: string, value: string) => setForm((p) => ({ ...p, [key]: value }));

  const drivePreviewUrl = invoice.drive_file_id
    ? `https://drive.google.com/file/d/${invoice.drive_file_id}/preview` : null;

  const mutation = useMutation({
    mutationFn: async () => {
      const pf = (v: string) => (v ? parseFloat(v) : null);
      const updates: Record<string, unknown> = {
        supplier_name: form.supplier_name || null, supplier_nif: form.supplier_nif || null,
        doc_number: form.doc_number || null, doc_date: form.doc_date || null,
        montant_ht: pf(form.montant_ht), montant_tva: pf(form.montant_tva),
        montant_ttc: pf(form.montant_ttc), taux_tva: pf(form.taux_tva),
        metier: form.metier || null, nature_depense: form.nature_depense || null,
        cost_type: form.cost_type || null, summary: form.summary || null,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from('invoices').update(updates).eq('id', invoice.id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateInvoiceLists(qc);
      onClose();
    },
  });

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50 md:left-60" onClick={onClose} />
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
