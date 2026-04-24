import { CheckCircle, XCircle, AlertTriangle, Loader2, FileText } from 'lucide-react';
import { formatEUR } from '@/lib/utils/validation';
import { useI18n } from '@/contexts/I18nContext';
import type { TranslationKey } from '@/lib/i18n';

export interface UploadFileState {
  id: string;
  fileName: string;
  status: 'pending' | 'uploading' | 'analyzing' | 'processing' | 'success' | 'error' | 'duplicate';
  progress: number;
  error?: string;
  supplierName?: string;
  montantTtc?: number;
  message?: string;
  // Referência ao File original — só existe enquanto está na fila de processamento.
  file?: File;
}

interface Props {
  files: UploadFileState[];
  isProcessing: boolean;
  onClear: () => void;
}

const BG: Record<string, string> = {
  pending: 'bg-gray-50 border-gray-200',
  uploading: 'bg-blue-50 border-blue-200',
  analyzing: 'bg-blue-50 border-blue-200',
  processing: 'bg-blue-50 border-blue-200',
  success: 'bg-green-50 border-green-200',
  error: 'bg-red-50 border-red-200',
  duplicate: 'bg-yellow-50 border-yellow-200',
};

export function UploadResultList({ files, isProcessing, onClear }: Props) {
  const { t } = useI18n();
  if (files.length === 0) return null;

  return (
    <div className="rounded-xl border bg-white">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="text-sm font-semibold text-gray-700">
          {files.length} {t('upload.files_count')}
        </h3>
        {!isProcessing && (
          <button onClick={onClear} className="text-xs text-gray-500 hover:text-gray-700">
            {t('upload.clear')}
          </button>
        )}
      </div>
      <div className="max-h-96 space-y-2 overflow-y-auto p-3">
        {files.map((f) => (
          <div key={f.id} className={`flex items-center gap-3 rounded-lg border p-3 ${BG[f.status] ?? BG.pending}`}>
            <StatusIcon status={f.status} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-gray-900">{f.fileName}</p>
              <StatusMessage file={f} t={t} />
              {(f.status === 'uploading' || f.status === 'analyzing' || f.status === 'processing') && (
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                  <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${f.progress}%` }} />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusMessage({ file, t }: { file: UploadFileState; t: (k: TranslationKey) => string }) {
  if (file.status === 'success' && file.supplierName) {
    return <p className="text-xs text-gray-500">{file.supplierName} &middot; {formatEUR(file.montantTtc ?? null)}</p>;
  }
  if (file.status === 'error' && file.error) {
    return <p className="text-xs text-red-500">{file.error}</p>;
  }
  if (file.status === 'duplicate') {
    return <p className="text-xs text-amber-600">{file.error || t('upload.duplicate')}</p>;
  }
  if (file.message) {
    return <p className="text-xs text-gray-500">{file.message}</p>;
  }
  if (file.status === 'pending') {
    return <p className="text-xs text-gray-400">{t('upload.pending')}</p>;
  }
  return null;
}

function StatusIcon({ status }: { status: UploadFileState['status'] }) {
  switch (status) {
    case 'pending': return <FileText className="h-5 w-5 text-gray-400" />;
    case 'uploading':
    case 'analyzing':
    case 'processing': return <Loader2 className="h-5 w-5 animate-spin text-blue-500" />;
    case 'success': return <CheckCircle className="h-5 w-5 text-green-500" />;
    case 'duplicate': return <AlertTriangle className="h-5 w-5 text-amber-500" />;
    case 'error': return <XCircle className="h-5 w-5 text-red-500" />;
  }
}
