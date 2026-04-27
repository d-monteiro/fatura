import { ExternalLink, Building2, Calendar, Hash, Tag, FileText, Table2, Pencil, Trash2 } from 'lucide-react';
import { formatEUR, formatDatePT } from '@/lib/utils/validation';
import { LineItemsTable } from './LineItemsTable';
import { useTenant } from '@/contexts/TenantContext';
import { useCategories } from '@/hooks/useCategories';
import type { TranslationKey } from '@/lib/i18n';
import type { Invoice, InvoiceLineItem } from '@/types/database';

type TFn = (key: TranslationKey) => string;

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

interface ContentProps {
  invoice: Invoice;
  lineItems: InvoiceLineItem[];
  t: TFn;
}

export function NormalDrawerContent({ invoice, lineItems, t }: ContentProps) {
  const { tenant } = useTenant();
  const { labelFor } = useCategories(tenant?.id);
  const categoryLabel = labelFor(invoice.category) || null;

  return (
    <div className="flex-1 overflow-y-auto px-5 py-4 space-y-1">
      <DetailRow icon={Building2} label={t('inv.supplier')} value={invoice.supplier_name || '—'} />
      {invoice.supplier_nif && <DetailRow icon={Hash} label={t('inv.nif')} value={invoice.supplier_nif} />}
      <DetailRow icon={Calendar} label={t('inv.date')} value={formatDatePT(invoice.doc_date)} />
      {invoice.doc_number && <DetailRow icon={FileText} label={t('inv.doc_number')} value={invoice.doc_number} />}
      {categoryLabel && <DetailRow icon={Tag} label={t('inv.category')} value={categoryLabel} />}
      {invoice.taxa_iva != null && (
        <DetailRow icon={Hash} label={t('inv.iva_rate')} value={`${invoice.taxa_iva}%`} />
      )}

      <div className="border-t my-3" />

      <div className="space-y-1">
        {invoice.valor_sem_iva != null && (
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">{t('inv.amount_net')}</span>
            <span className="font-medium text-gray-700">{formatEUR(invoice.valor_sem_iva)}</span>
          </div>
        )}
        {invoice.valor_iva != null && (
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">{t('inv.iva')}</span>
            <span className="font-medium text-gray-700">{formatEUR(invoice.valor_iva)}</span>
          </div>
        )}
        <div className="flex items-center justify-between py-2">
          <span className="text-base font-semibold text-gray-500">{t('drawer.total')}</span>
          <span className="text-2xl font-bold text-gray-900">{formatEUR(invoice.valor_total)}</span>
        </div>
      </div>

      {invoice.summary && (
        <div className="rounded-lg bg-gray-50 p-3 mt-2">
          <p className="text-xs text-gray-500 mb-1">{t('inv.summary')}</p>
          <p className="text-sm text-gray-700">{invoice.summary}</p>
        </div>
      )}

      {lineItems.length > 0 && (
        <div className="mt-3"><LineItemsTable items={lineItems} /></div>
      )}

      {invoice.created_at && (
        <div className="mt-4 rounded-lg bg-gray-50 p-3">
          <p className="text-xs text-gray-400">
            {t('drawer.added_at')} {formatDatePT(invoice.created_at)}
          </p>
        </div>
      )}
    </div>
  );
}

interface FooterProps {
  invoice: Invoice;
  t: TFn;
  onEdit: () => void;
  onDelete: () => void;
}

export function NormalDrawerFooter({ invoice, t, onEdit, onDelete }: FooterProps) {
  // Para faturas ignoradas (deleted_at != null) não há Drive — mostrar
  // antes o file_url do bucket Supabase.
  const fileLink = invoice.drive_link || invoice.file_url || null;
  const isStorageOnly = !invoice.drive_link && !!invoice.file_url;

  return (
    <div className="border-t px-5 py-3 space-y-2">
      <div className="flex gap-2">
        {fileLink && (
          <a href={fileLink} target="_blank" rel="noopener noreferrer"
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
            <ExternalLink className="h-4 w-4" />
            {isStorageOnly ? t('drawer.view_file') : t('drawer.view_pdf')}
          </a>
        )}
        {invoice.spreadsheet_id && (
          <a href={`https://docs.google.com/spreadsheets/d/${invoice.spreadsheet_id}/edit`}
            target="_blank" rel="noopener noreferrer"
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
            <Table2 className="h-4 w-4" /> {t('drawer.open_sheets')}
          </a>
        )}
      </div>
      <div className="flex gap-2">
        <button onClick={onEdit}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:opacity-90 transition-all">
          <Pencil className="h-4 w-4" /> {t('drawer.edit')}
        </button>
        <button onClick={onDelete}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50">
          <Trash2 className="h-4 w-4" /> {t('drawer.delete')}
        </button>
      </div>
    </div>
  );
}
