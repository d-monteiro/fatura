import { CheckCircle, XCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { formatEUR } from '@/lib/utils/validation';
import { useI18n } from '@/contexts/I18nContext';

export interface UploadFileState {
  id: string;
  fileName: string;
  status: 'uploading' | 'processing' | 'success' | 'error' | 'duplicate';
  progress: number;       // 0-100
  error?: string;
  supplierName?: string;
  montantTtc?: number;
}

interface UploadResultListProps {
  files: UploadFileState[];
}

export function UploadResultList({ files }: UploadResultListProps) {
  const { t } = useI18n();
  if (files.length === 0) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-700">Resultats</h3>
      {files.map((f) => (
        <div
          key={f.id}
          className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4"
        >
          <StatusIcon status={f.status} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-gray-900">{f.fileName}</p>
            {f.status === 'success' && f.supplierName && (
              <p className="text-xs text-gray-500">
                {f.supplierName} &middot; {formatEUR(f.montantTtc ?? null)}
              </p>
            )}
            {f.status === 'error' && f.error && (
              <p className="text-xs text-red-500">{f.error}</p>
            )}
            {f.status === 'duplicate' && (
              <p className="text-xs text-amber-600">{t('upload.duplicate')}</p>
            )}
            {(f.status === 'uploading' || f.status === 'processing') && (
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all"
                  style={{ width: `${f.progress}%` }}
                />
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function StatusIcon({ status }: { status: UploadFileState['status'] }) {
  switch (status) {
    case 'uploading':
    case 'processing':
      return <Loader2 className="h-5 w-5 animate-spin text-blue-500" />;
    case 'success':
      return <CheckCircle className="h-5 w-5 text-green-500" />;
    case 'duplicate':
      return <AlertTriangle className="h-5 w-5 text-amber-500" />;
    case 'error':
      return <XCircle className="h-5 w-5 text-red-500" />;
  }
}
