import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Settings } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { DropZone } from '@/components/upload/DropZone';
import { UploadResultList, type UploadFileState } from '@/components/upload/UploadResultList';
import { processInvoiceUpload, type UploadResult } from '@/lib/invoiceProcessor';
import { useUploadDeps } from '@/hooks/useUploadDeps';

export default function Upload() {
  const { t } = useI18n();
  const { userId, companyId, accessToken, ready, noGoogle, loading } = useUploadDeps();
  const [files, setFiles] = useState<UploadFileState[]>([]);
  const [processing, setProcessing] = useState(false);

  const addEntry = useCallback((entry: UploadFileState) => {
    setFiles((prev) => [entry, ...prev]);
  }, []);

  const updateFile = useCallback((id: string, patch: Partial<UploadFileState>) => {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }, []);

  const applyResult = useCallback((id: string, r: UploadResult) => {
    if (r.isDuplicate) {
      updateFile(id, { status: 'duplicate', progress: 100, error: r.error });
    } else if (r.success && r.invoice) {
      updateFile(id, {
        status: 'success', progress: 100,
        supplierName: r.invoice.supplier_name ?? undefined,
        montantTtc: r.invoice.montant_ttc ?? undefined,
      });
    } else {
      updateFile(id, { status: 'error', progress: 100, error: r.error });
    }
  }, [updateFile]);

  const handleFiles = useCallback(async (newFiles: File[]) => {
    if (!accessToken) return;
    setProcessing(true);

    for (const file of newFiles) {
      const baseId = `${Date.now()}-${file.name}`;
      const entry: UploadFileState = { id: baseId, fileName: file.name, status: 'processing', progress: 30 };
      addEntry(entry);

      const results = await processInvoiceUpload(file, userId, accessToken, companyId);

      if (results.length === 1) {
        applyResult(baseId, results[0]);
      } else {
        // Multiple invoices in one file: create one row per invoice
        updateFile(baseId, { status: 'success', progress: 100, supplierName: `${results.length} factures extraites` });
        results.forEach((r, i) => {
          const subId = `${baseId}-${i}`;
          const label = r.invoice?.supplier_name ?? file.name;
          addEntry({ id: subId, fileName: label, status: 'processing', progress: 80 });
          applyResult(subId, r);
        });
      }
    }

    setProcessing(false);
  }, [userId, companyId, accessToken, addEntry, updateFile, applyResult]);

  const successCount = files.filter((f) => f.status === 'success').length;
  const errorCount = files.filter((f) => f.status === 'error' || f.status === 'duplicate').length;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">{t('upload.title')}</h1>

      {noGoogle && <NoGoogleBanner />}

      <DropZone onFiles={handleFiles} disabled={processing || !ready || loading} />

      {files.length > 0 && (
        <div className="flex gap-4 text-sm">
          <span className="text-gray-500">{files.length} {t('upload.files_count')}</span>
          {successCount > 0 && <span className="text-green-600">{successCount} {t('upload.success_count')}</span>}
          {errorCount > 0 && <span className="text-red-500">{errorCount} {t('upload.error_count')}</span>}
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
