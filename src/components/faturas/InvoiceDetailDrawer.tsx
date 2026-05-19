import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/client';
import { useI18n } from '@/contexts/I18nContext';
import { invalidateInvoiceLists, queryKeys } from '@/lib/queryKeys';
import { reportError } from '@/lib/errors/errorReporter';
import { InvoiceReviewDialog } from './InvoiceReviewDialog';
import { InvoiceEditDialog } from './InvoiceEditDialog';
import { InvoiceIgnoredDialog } from './InvoiceIgnoredDialog';
import { InvoiceDocPreview } from './InvoiceDocPreview';
import { NormalDrawerContent, NormalDrawerFooter } from './InvoiceNormalDrawer';
import { invoiceIdentifier } from './invoiceDisplay';
import { useTenant } from '@/contexts/TenantContext';
import { useRole } from '@/hooks/useRole';
import { useCategories } from '@/hooks/useCategories';
import { recoverInvoice } from '@/lib/invoices/recoverInvoice';
import type { Invoice, InvoiceLineItem } from '@/types/database';

interface Props {
  invoice: Invoice | null;
  open: boolean;
  onClose: () => void;
}

export function InvoiceDetailDrawer({ invoice, open, onClose }: Props) {
  const { t } = useI18n();
  const { tenant } = useTenant();
  const { can } = useRole();
  const { labelFor } = useCategories(tenant?.id);
  const qc = useQueryClient();
  const [internalEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const canEdit = can('edit_invoice');
  const canDelete = can('delete_invoice');
  const canApprove = can('approve_invoice');
  const isIgnored = !!invoice?.deleted_at;
  const isReviewMode = !isIgnored && canApprove && (invoice?.status === 'review' || invoice?.status === 'inbox');
  const isEditing = open && internalEditing && canEdit;

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
    mutationKey: ['invoice-approve', invoice?.id],
    mutationFn: async () => {
      const { error } = await supabase.from('invoices')
        .update({ status: 'processed', manual_review: false }).eq('id', invoice!.id);
      if (error) throw error;
    },
    onSuccess: () => { invalidateInvoiceLists(qc); onClose(); },
  });

  const recoverMutation = useMutation({
    mutationKey: ['invoice-recover', invoice?.id],
    mutationFn: () => recoverInvoice(invoice!.id),
    onSuccess: () => {
      invalidateInvoiceLists(qc);
      toast.success('Fatura recuperada. Vê na aba "Faturas" com o aviso de verificação.');
      onClose();
    },
    onError: (err) => {
      void reportError(err, { component: 'InvoiceDetailDrawer.recoverMutation', extra: { invoiceId: invoice?.id } });
      toast.error(err instanceof Error ? err.message : 'Erro a recuperar');
    },
  });

  const deleteMutation = useMutation({
    mutationKey: ['invoice-delete', invoice?.id],
    mutationFn: async () => {
      setIsDeleting(true);
      const { data, error } = await supabase.from('invoices')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', invoice!.id)
        .is('deleted_at', null)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Nenhuma fatura foi eliminada (RLS ou ID inválido)');
    },
    onSuccess: () => {
      invalidateInvoiceLists(qc);
      toast.success(t('toast.invoice_deleted'));
      onClose();
    },
    onError: (err) => {
      void reportError(err, { component: 'InvoiceDetailDrawer.deleteMutation', extra: { invoiceId: invoice?.id } });
      toast.error(err instanceof Error ? err.message : t('toast.invoice_delete_failed'));
    },
    onSettled: () => setIsDeleting(false),
  });

  const handleStartEdit = useCallback(() => { if (canEdit) setIsEditing(true); }, [canEdit]);
  const handleCloseEdit = useCallback(() => setIsEditing(false), []);
  const handleDelete = useCallback(() => { if (canDelete) deleteMutation.mutate(); }, [canDelete, deleteMutation]);
  const handleApprove = useCallback(() => { if (canApprove) approveMutation.mutate(); }, [canApprove, approveMutation]);
  const handleRecover = useCallback(() => {
    if (can('recover_invoice')) recoverMutation.mutate();
  }, [can, recoverMutation]);

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

  // MODE 4 - Ignored split screen (preview + dados read-only + Recuperar)
  if (isIgnored) {
    return (
      <InvoiceIgnoredDialog
        invoice={invoice}
        open
        onClose={onClose}
        onRecover={handleRecover}
        canRecover={can('recover_invoice')}
        isRecovering={recoverMutation.isPending}
      />
    );
  }

  // MODE 1 - Normal drawer (split com preview do documento)
  const categoryLabel = labelFor(invoice.category) || null;
  const ident = invoiceIdentifier(invoice);
  const canRecover = can('recover_invoice');
  const drivePreviewUrl = invoice.drive_file_id
    ? `https://drive.google.com/file/d/${invoice.drive_file_id}/preview`
    : null;
  const mobileDocLink = invoice.drive_link || drivePreviewUrl || invoice.file_url || null;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50 md:left-60" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:left-60">
        <div className="relative flex h-[90vh] w-full max-w-[95vw] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl md:w-[1400px]"
          onClick={(e) => e.stopPropagation()}>
          <div className="flex flex-1 flex-col md:flex-row min-h-0">
            <div className="hidden md:flex flex-1 bg-gray-100 min-h-0 items-center justify-center">
              <InvoiceDocPreview invoice={invoice} />
            </div>

            <div className="flex w-full flex-col md:w-[380px] md:shrink-0 min-h-0 flex-1 md:flex-none border-l">
              <div className="border-b px-4 py-3">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-semibold text-gray-900 truncate">{ident.primary}</h2>
                    {ident.secondary && <p className="truncate text-xs text-gray-500">{ident.secondary}</p>}
                    {company?.name && <p className="truncate text-xs text-gray-500">{company.name}</p>}
                    {mobileDocLink && (
                      <a href={mobileDocLink} target="_blank" rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 md:hidden">
                        <ExternalLink className="h-4 w-4" /> {t('drawer.view_pdf')}
                      </a>
                    )}
                  </div>
                  <button onClick={onClose} className="rounded-lg p-1 hover:bg-gray-100"><X className="h-5 w-5" /></button>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {invoice.document_type && (
                    <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">{invoice.document_type}</span>
                  )}
                  {categoryLabel && (
                    <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-medium text-violet-700">{categoryLabel}</span>
                  )}
                  {invoice.autoliquidacao && (
                    <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-medium text-orange-700">{t('inv.autoliquidacao')}</span>
                  )}
                </div>
              </div>
              <NormalDrawerContent invoice={invoice} lineItems={lineItems ?? []} t={t} isIgnored={false} />
              <NormalDrawerFooter
                invoice={invoice}
                t={t}
                onEdit={handleStartEdit}
                onDelete={() => setShowDeleteConfirm(true)}
                onRecover={handleRecover}
                canEdit={canEdit}
                canDelete={canDelete}
                canRecover={canRecover}
                isIgnored={false}
                isRecovering={recoverMutation.isPending}
              />
            </div>
          </div>
        </div>
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
