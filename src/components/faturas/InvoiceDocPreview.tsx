import { useI18n } from '@/contexts/I18nContext';
import type { Invoice } from '@/types/database';

interface Props {
  invoice: Invoice;
}

function stripQuery(url: string) {
  const i = url.indexOf('?');
  return i === -1 ? url : url.slice(0, i);
}

export function InvoiceDocPreview({ invoice }: Props) {
  const { t } = useI18n();

  // 1. Drive (fatura já sincronizada)
  if (invoice.drive_file_id) {
    const base = stripQuery(invoice.file_url || '');
    const pathOrUrl = invoice.storage_path || base;
    const isImage = /\.(jpe?g|png)$/i.test(pathOrUrl);
    if (isImage) {
      return (
        <div className="w-full h-full flex items-center justify-center p-4 overflow-auto">
          <img
            src={`https://drive.google.com/thumbnail?id=${invoice.drive_file_id}&sz=w1000`}
            alt="Document"
            className="max-w-full max-h-full object-contain rounded"
          />
        </div>
      );
    }
    return (
      <div className="w-full h-full p-2">
        <iframe
          src={`https://drive.google.com/file/d/${invoice.drive_file_id}/preview`}
          className="w-full h-full border-0 rounded-lg"
          title="Document Preview"
          allow="autoplay"
          loading="lazy"
        />
      </div>
    );
  }

  // 2. Supabase signed URL (fatura recém-vinda por email, ainda sem Drive)
  if (invoice.file_url) {
    const base = stripQuery(invoice.file_url);
    const pathHint = invoice.storage_path || base;
    const isImage = /\.(jpe?g|png)$/i.test(pathHint);
    if (isImage) {
      return (
        <div className="w-full h-full flex items-center justify-center p-4 overflow-auto">
          <img src={invoice.file_url} alt="Document" className="max-w-full max-h-full object-contain rounded" />
        </div>
      );
    }
    return (
      <div className="w-full h-full p-2">
        <iframe
          src={invoice.file_url}
          className="w-full h-full border-0 rounded-lg"
          title="Document Preview"
          loading="lazy"
        />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center h-full text-gray-400">
      <p>{t('drawer.doc_not_available')}</p>
    </div>
  );
}
