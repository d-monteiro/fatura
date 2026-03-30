import { useState } from 'react';
import { X, ExternalLink, Building2, Calendar, Hash, Tag, Wrench, FileText, CheckCircle, Pencil, Trash2 } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { formatEUR, formatDateFR } from '@/lib/utils/validation';
import { InvoiceDocPreview } from './InvoiceDocPreview';
import type { Invoice } from '@/types/database';

interface Props {
  invoice: Invoice;
  open: boolean;
  onClose: () => void;
  onApprove: () => void;
  onEdit: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}

function DetailRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100">
        <Icon className="h-4 w-4 text-gray-500" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-sm font-medium text-gray-900 break-words">{value}</p>
      </div>
    </div>
  );
}

export function InvoiceReviewDialog({ invoice, open, onClose, onApprove, onEdit, onDelete, isDeleting }: Props) {
  const { t } = useI18n();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const drivePreviewUrl = invoice.drive_file_id
    ? `https://drive.google.com/file/d/${invoice.drive_file_id}/preview`
    : null;
  const costLabel = invoice.cost_type === 'cout_fixe' ? 'Fixe' : invoice.cost_type === 'cout_variable' ? 'Variable' : null;

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="relative flex h-[90vh] w-full max-w-[95vw] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl md:w-[1400px]"
          onClick={(e) => e.stopPropagation()}>
          <div className="flex flex-1 flex-col md:flex-row min-h-0">
            {/* LEFT - Document preview (hidden on mobile) */}
            <div className="hidden md:flex flex-1 bg-gray-50 border-r min-h-0">
              <InvoiceDocPreview invoice={invoice} />
            </div>

            {/* RIGHT - Data panel */}
            <div className="flex w-full flex-col md:w-[400px] min-h-0 flex-1 md:flex-none">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold text-gray-900 truncate">{t('review.title')}</h2>
                    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                      {t('review.badge')}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 truncate">{invoice.supplier_name}</p>
                  {/* Mobile: link to open document */}
                  {drivePreviewUrl && (
                    <button onClick={() => window.open(invoice.drive_link || drivePreviewUrl, '_blank')}
                      className="mt-2 inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 md:hidden">
                      <ExternalLink className="h-4 w-4" /> {t('drawer.view_doc')}
                    </button>
                  )}
                </div>
                <button onClick={onClose} className="rounded-lg p-1 hover:bg-gray-100"><X className="h-5 w-5" /></button>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1 min-h-0">
                <DetailRow icon={Building2} label={t('inv.supplier')} value={invoice.supplier_name || '\u2014'} />
                {invoice.supplier_siret && <DetailRow icon={Hash} label={t('inv.siret')} value={invoice.supplier_siret} />}
                <DetailRow icon={Calendar} label={t('inv.date')} value={formatDateFR(invoice.doc_date)} />
                {invoice.doc_number && <DetailRow icon={FileText} label={t('inv.doc_number')} value={invoice.doc_number} />}
                {invoice.metier && <DetailRow icon={Wrench} label={t('inv.metier')} value={invoice.metier} />}
                {invoice.nature_depense && <DetailRow icon={Tag} label={t('inv.nature')} value={invoice.nature_depense} />}
                {costLabel && <DetailRow icon={Tag} label={t('inv.cost_type')} value={costLabel} />}
                {invoice.taux_tva != null && (
                  <DetailRow icon={Hash} label={t('inv.tva_rate')} value={`${invoice.taux_tva}%`} />
                )}

                <div className="border-t my-2" />

                <div className="flex items-center justify-between py-3">
                  <span className="text-base font-medium text-gray-500">{t('drawer.total')}</span>
                  <span className="text-2xl font-bold text-gray-900">{formatEUR(invoice.montant_ttc)}</span>
                </div>

                {invoice.summary && (
                  <div className="rounded-lg bg-gray-50 p-3">
                    <p className="text-xs text-gray-500 mb-1">{t('inv.summary')}</p>
                    <p className="text-sm text-gray-700">{invoice.summary}</p>
                  </div>
                )}
              </div>

              {/* Buttons */}
              <div className="border-t px-4 py-3 space-y-2 bg-white">
                <button onClick={onApprove}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700">
                  <CheckCircle className="h-4 w-4" /> {t('review.approve')}
                </button>
                <div className="flex gap-2">
                  <button onClick={onEdit}
                    className="flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                    <Pencil className="h-4 w-4" /> {t('drawer.edit')}
                  </button>
                  <button onClick={() => setShowDeleteConfirm(true)}
                    className="flex items-center justify-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50">
                    <Trash2 className="h-4 w-4" /> {t('drawer.delete')}
                  </button>
                </div>
                <button onClick={onClose}
                  className="w-full rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-gray-50">
                  {t('review.close')}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <>
          <div className="fixed inset-0 z-[60] bg-black/40" onClick={() => setShowDeleteConfirm(false)} />
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-semibold text-gray-900">{t('drawer.delete_confirm')}</h3>
              <p className="mt-2 text-sm text-gray-500">{t('drawer.delete_confirm_detail')}</p>
              <div className="mt-4 flex justify-end gap-2">
                <button onClick={() => setShowDeleteConfirm(false)}
                  className="rounded-lg border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                  {t('action.cancel')}
                </button>
                <button onClick={() => { onDelete(); setShowDeleteConfirm(false); }}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">
                  {isDeleting ? t('drawer.deleting') : t('action.delete')}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
