import { useI18n } from '@/contexts/I18nContext';
import type { Invoice } from '@/types/database';

interface Props {
  invoice: Invoice;
}

/** Shared PDF/image preview for split-screen dialogs. */
export function InvoiceDocPreview({ invoice }: Props) {
  const { t } = useI18n();
  const fileUrl = invoice.drive_link || invoice.file_url || '';
  const isImage = /\.(jpg|jpeg|png)$/i.test(fileUrl);
  const drivePreviewUrl = invoice.drive_file_id
    ? `https://drive.google.com/file/d/${invoice.drive_file_id}/preview`
    : null;
  const imageThumbnailUrl = invoice.drive_file_id && isImage
    ? `https://drive.google.com/thumbnail?id=${invoice.drive_file_id}&sz=w1000`
    : null;

  if (imageThumbnailUrl) {
    return (
      <div className="w-full h-full flex items-center justify-center p-4 overflow-auto">
        <img src={imageThumbnailUrl} alt="Document" className="max-w-full max-h-full object-contain rounded" />
      </div>
    );
  }

  if (drivePreviewUrl) {
    return (
      <iframe src={drivePreviewUrl} className="w-full h-full border-0" title="Document Preview" allow="autoplay" />
    );
  }

  return (
    <div className="flex items-center justify-center h-full text-gray-400">
      <p>{t('drawer.doc_not_available')}</p>
    </div>
  );
}
