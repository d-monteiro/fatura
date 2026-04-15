import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useI18n } from '@/contexts/I18nContext';
import { invalidateInvoiceLists, queryKeys } from '@/lib/queryKeys';
import { InvoiceReviewDialog } from './InvoiceReviewDialog';
import { InvoiceEditDialog } from './InvoiceEditDialog';
import { NormalDrawerContent, NormalDrawerFooter } from './InvoiceNormalDrawer';
import type { Invoice, InvoiceLineItem } from '@/types/database';

interface Props {
  invoice: Invoice | null;
  open: boolean;
  onClose: () => void;
}

export function InvoiceDetailDrawer({ invoice, open, onClose }: Props) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const isReviewMode = invoice?.status === 'review' || invoice?.status === 'inbox';

  useEffect(() => { if (!open) setIsEditing(false); }, [open]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (open && !isEditing) document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [open, onClose, isEditing]);

  const { data: lineItems } = useQuery({
    queryKey: invoice?.id ? queryKeys.lineItems(invoice.id) : ['line-items', 'none'],
    enabled: !!invoice?.id && !isReviewMode,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoice_line_items').select('*')
        .eq('invoice_id', invoice!.id).order('line_number');
      if (error) throw error;
      return data as InvoiceLineItem[];
    },
  });

  const { data: company } = useQuery({
    queryKey: invoice?.company_id ? queryKeys.company(invoice.company_id) : ['company', 'none'],
    enabled: !!invoice?.company_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies').select('name').eq('id', invoice!.company_id).single();
      if (error) throw error;
      return data as { name: string };
    },
  });

  const approveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('invoices')
        .update({ status: 'processed', manual_review: false }).eq('id', invoice!.id);
      if (error) throw error;
    },
    onSuccess: () => { invalidateInvoiceLists(qc); onClose(); },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      setIsDeleting(true);
      const { error } = await supabase.from('invoices')
        .update({ deleted_at: new Date().toISOString() }).eq('id', invoice!.id);
      if (error) throw error;
    },
    onSuccess: () => { invalidateInvoiceLists(qc); onClose(); },
    onSettled: () => setIsDeleting(false),
  });

  const handleStartEdit = useCallback(() => setIsEditing(true), []);
  const handleCloseEdit = useCallback(() => setIsEditing(false), []);
  const handleDelete = useCallback(() => deleteMutation.mutate(), [deleteMutation]);
  const handleApprove = useCallback(() => approveMutation.mutate(), [approveMutation]);

  if (!open || !invoice) return null;

  // MODE 3 - Edit split screen
  if (isEditing) return <InvoiceEditDialog invoice={invoice} open onClose={handleCloseEdit} />;

  // MODE 2 - Review split screen
  if (isReviewMode) {
    return (
      <InvoiceReviewDialog invoice={invoice} open onClose={onClose}
        onApprove={handleApprove} onEdit={handleStartEdit} onDelete={handleDelete} isDeleting={isDeleting} />
    );
  }

  // MODE 1 - Normal drawer
  const costLabel = invoice.cost_type === 'cout_fixe' ? 'Fixe' : invoice.cost_type === 'cout_variable' ? 'Variable' : null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-white shadow-xl">
        <div className="border-b px-5 py-4">
          <div className="flex items-start justify-between">
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-bold text-gray-900 truncate">{invoice.supplier_name || '\u2014'}</h2>
              {company?.name && <p className="text-sm text-gray-500">{company.name}</p>}
            </div>
            <button onClick={onClose} className="rounded-lg p-1 hover:bg-gray-100"><X className="h-5 w-5" /></button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {invoice.document_type && (
              <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">{invoice.document_type}</span>
            )}
            {costLabel && (
              <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">{costLabel}</span>
            )}
            {invoice.metier && (
              <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-medium text-violet-700">{invoice.metier}</span>
            )}
            {invoice.autoliquidation && (
              <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-medium text-orange-700">{t('inv.autoliquidation')}</span>
            )}
          </div>
        </div>
        <NormalDrawerContent invoice={invoice} lineItems={lineItems ?? []} t={t} />
        <NormalDrawerFooter invoice={invoice} t={t} onEdit={handleStartEdit} onDelete={() => setShowDeleteConfirm(true)} />
      </div>

      {showDeleteConfirm && (
        <>
          <div className="fixed inset-0 z-[60] bg-black/40" onClick={() => setShowDeleteConfirm(false)} />
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-semibold text-gray-900">{t('drawer.delete_confirm')}</h3>
              <p className="mt-2 text-sm text-gray-500">{t('drawer.delete_confirm_detail')}</p>
              <div className="mt-4 flex justify-end gap-2">
                <button onClick={() => setShowDeleteConfirm(false)}
                  className="rounded-lg border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">{t('action.cancel')}</button>
                <button onClick={() => { handleDelete(); setShowDeleteConfirm(false); }}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">
                  {isDeleting ? t('drawer.deleting') : t('action.delete')}</button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
