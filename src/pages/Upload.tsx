import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Settings } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { DropZone } from '@/components/upload/DropZone';
import { UploadResultList, type UploadFileState } from '@/components/upload/UploadResultList';
import { processInvoiceUpload } from '@/lib/invoiceProcessor';
import { useUploadDeps } from '@/hooks/useUploadDeps';

export default function Upload() {
  const { t } = useI18n();
  const { userId, companyId, accessToken, ready, noGoogle, noCompany, loading } = useUploadDeps();
  const [files, setFiles] = useState<UploadFileState[]>([]);
  const [processing, setProcessing] = useState(false);

  const updateFile = useCallback((id: string, patch: Partial<UploadFileState>) => {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }, []);

  const handleFiles = useCallback(async (newFiles: File[]) => {
    if (!companyId || !accessToken) return;
    setProcessing(true);

    const entries: UploadFileState[] = newFiles.map((f, i) => ({
      id: `${Date.now()}-${i}`,
      fileName: f.name,
      status: 'uploading' as const,
      progress: 0,
    }));
    setFiles((prev) => [...entries, ...prev]);

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      updateFile(entry.id, { status: 'uploading', progress: 20 });

      // Mark as "processing" (Gemini analysis + Drive upload)
      updateFile(entry.id, { status: 'processing', progress: 50 });

      const result = await processInvoiceUpload(newFiles[i], companyId, userId, accessToken);

      if (result.isDuplicate) {
        updateFile(entry.id, { status: 'duplicate', progress: 100, error: result.error });
      } else if (result.success && result.invoice) {
        updateFile(entry.id, {
          status: 'success',
          progress: 100,
          supplierName: result.invoice.supplier_name ?? undefined,
          montantTtc: result.invoice.montant_ttc ?? undefined,
        });
      } else {
        updateFile(entry.id, { status: 'error', progress: 100, error: result.error });
      }
    }

    setProcessing(false);
  }, [companyId, userId, accessToken, updateFile]);

  const successCount = files.filter((f) => f.status === 'success').length;
  const errorCount = files.filter((f) => f.status === 'error' || f.status === 'duplicate').length;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">{t('upload.title')}</h1>

      {noGoogle && <NoGoogleBanner />}
      {noCompany && <NoCompanyBanner />}

      <DropZone onFiles={handleFiles} disabled={processing || !ready || loading} />

      {files.length > 0 && (
        <div className="flex gap-4 text-sm">
          <span className="text-gray-500">{files.length} {t('upload.files_count')}</span>
          {successCount > 0 && (
            <span className="text-green-600">{successCount} {t('upload.success_count')}</span>
          )}
          {errorCount > 0 && (
            <span className="text-red-500">{errorCount} {t('upload.error_count')}</span>
          )}
        </div>
      )}

      <UploadResultList files={files} />
    </div>
  );
}

function NoGoogleBanner() {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
      <AlertCircle className="h-5 w-5 shrink-0 text-amber-600" />
      <p className="flex-1 text-sm text-amber-800">{t('upload.no_google')}</p>
      <Link
        to="/settings"
        className="flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700"
      >
        <Settings className="h-4 w-4" />
        {t('upload.go_settings')}
      </Link>
    </div>
  );
}

function NoCompanyBanner() {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
      <AlertCircle className="h-5 w-5 shrink-0 text-red-500" />
      <p className="text-sm text-red-700">{t('upload.no_company')}</p>
    </div>
  );
}
