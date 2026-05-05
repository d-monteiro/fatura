import { X, ExternalLink, Building2, Calendar, Hash, Tag, FileText, RotateCcw, AlertTriangle } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { formatEUR } from '@/lib/utils/validation';
import { InvoiceDocPreview } from './InvoiceDocPreview';
import { useTenant } from '@/contexts/TenantContext';
import { useCategories } from '@/hooks/useCategories';
import { humanIgnoredReason, invoiceDisplayDate, invoiceIdentifier } from './invoiceDisplay';
import type { Invoice } from '@/types/database';

interface Props {
  invoice: Invoice;
  open: boolean;
  onClose: () => void;
  onRecover: () => void;
  canRecover: boolean;
  isRecovering: boolean;
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

export function InvoiceIgnoredDialog({ invoice, open, onClose, onRecover, canRecover, isRecovering }: Props) {
  const { t } = useI18n();
  const { tenant } = useTenant();
  const { labelFor } = useCategories(tenant?.id);
  const categoryLabel = labelFor(invoice.category) || null;
  const ident = invoiceIdentifier(invoice);
  const displayDate = invoiceDisplayDate(invoice);
  const reason = humanIgnoredReason(invoice.review_reason);
  const drivePreviewUrl = invoice.drive_file_id
    ? `https://drive.google.com/file/d/${invoice.drive_file_id}/preview`
    : null;
  const mobileDocLink = invoice.drive_link || drivePreviewUrl || invoice.file_url;

  if (!open) return null;

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
              <div className="flex items-center justify-between border-b px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold text-gray-900 truncate">{ident.primary}</h2>
                    <span className="rounded-full bg-gray-200 px-2.5 py-0.5 text-xs font-medium text-gray-700 shrink-0">
                      Ignorado
                    </span>
                  </div>
                  {ident.secondary && <p className="truncate text-sm text-gray-500">{ident.secondary}</p>}
                  {mobileDocLink && (
                    <a href={mobileDocLink} target="_blank" rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 md:hidden">
                      <ExternalLink className="h-4 w-4" /> {t('drawer.view_doc')}
                    </a>
                  )}
                </div>
                <button onClick={onClose} className="rounded-lg p-1 hover:bg-gray-100"><X className="h-5 w-5" /></button>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1 min-h-0">
                <div className="mb-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <div>
                    <p className="font-medium">Razão para ignorar</p>
                    <p className="text-amber-800/80">{reason}</p>
                  </div>
                </div>

                {invoice.supplier_name && (
                  <DetailRow icon={Building2} label={t('inv.supplier')} value={invoice.supplier_name} />
                )}
                {invoice.supplier_nif && <DetailRow icon={Hash} label={t('inv.nif')} value={invoice.supplier_nif} />}
                <DetailRow icon={Calendar} label={t('inv.date')} value={displayDate} />
                {invoice.doc_number && <DetailRow icon={FileText} label={t('inv.doc_number')} value={invoice.doc_number} />}
                {categoryLabel && <DetailRow icon={Tag} label={t('inv.category')} value={categoryLabel} />}
                {invoice.taxa_iva != null && (
                  <DetailRow icon={Hash} label={t('inv.iva_rate')} value={`${invoice.taxa_iva}%`} />
                )}
                {invoice.email_subject && (
                  <DetailRow icon={FileText} label="Assunto do email" value={invoice.email_subject} />
                )}
                {invoice.email_from && (
                  <DetailRow icon={Building2} label="Remetente" value={invoice.email_from} />
                )}

                {(invoice.valor_total != null || invoice.valor_sem_iva != null) && (
                  <>
                    <div className="border-t my-2" />
                    {invoice.valor_total != null && (
                      <div className="flex items-center justify-between py-3">
                        <span className="text-base font-medium text-gray-500">{t('drawer.total')}</span>
                        <span className="text-2xl font-bold text-gray-900">{formatEUR(invoice.valor_total)}</span>
                      </div>
                    )}
                  </>
                )}

                {invoice.summary && (
                  <div className="rounded-lg bg-gray-50 p-3">
                    <p className="text-xs text-gray-500 mb-1">{t('inv.summary')}</p>
                    <p className="text-sm text-gray-700">{invoice.summary}</p>
                  </div>
                )}
              </div>

              <div className="border-t px-4 py-3 space-y-2 bg-white">
                {canRecover && (
                  <button onClick={onRecover} disabled={isRecovering}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:opacity-90 transition-all disabled:opacity-60">
                    <RotateCcw className="h-4 w-4" />
                    {isRecovering ? 'A recuperar…' : 'Recuperar como fatura'}
                  </button>
                )}
                <button onClick={onClose}
                  className="w-full rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-gray-50">
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
