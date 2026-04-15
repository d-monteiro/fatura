import { useState } from 'react';
import { FileArchive, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@/contexts/I18nContext';
import { useUploadDeps } from '@/hooks/useUploadDeps';
import { exportInvoicesToZip } from '@/lib/sync/exportZip';
import type { Invoice } from '@/types/database';

interface ZipExportButtonProps {
  invoices: Invoice[];
}

export function ZipExportButton({ invoices }: ZipExportButtonProps) {
  const { t } = useI18n();
  const { accessToken } = useUploadDeps();
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    if (!invoices.length) return;
    if (!accessToken) {
      toast.error(t('error.no_google'));
      return;
    }
    setLoading(true);
    try {
      await exportInvoicesToZip(invoices, accessToken);
    } catch {
      toast.error('Erro ao criar o ZIP');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={loading || !invoices.length}
      className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-white px-4 py-2
                 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50"
    >
      {loading
        ? <Loader2 className="h-4 w-4 animate-spin" />
        : <FileArchive className="h-4 w-4" />}
      {loading ? t('action.exporting') : t('action.export_zip')}
    </button>
  );
}
