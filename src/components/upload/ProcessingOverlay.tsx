import { Loader2, CheckCircle, Upload } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';

interface ProcessingOverlayProps {
  isProcessing: boolean;
  currentIndex: number;
  totalCount: number;
  completedCount: number;
  errorCount: number;
  progress: number;
  onReset: () => void;
}

export function ProcessingOverlay({
  isProcessing, currentIndex, totalCount,
  completedCount, errorCount, progress, onReset,
}: ProcessingOverlayProps) {
  const { t } = useI18n();

  if (isProcessing) {
    return (
      <div className="flex flex-col items-center space-y-4 py-4">
        <Loader2 className="h-12 w-12 animate-spin text-blue-600" />
        <p className="text-lg font-medium text-gray-900">
          {t('upload.processing_x_of_y')
            .replace('{current}', String(currentIndex + 1))
            .replace('{total}', String(totalCount))}
        </p>
        <div className="h-2 w-full max-w-xs overflow-hidden rounded-full bg-gray-100">
          <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${progress}%` }} />
        </div>
        <p className="text-sm text-gray-500">
          {completedCount} {t('upload.success_count')}, {errorCount} {t('upload.error_count')}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center space-y-4 py-4">
      <CheckCircle className="h-12 w-12 text-green-600" />
      <p className="text-lg font-medium text-green-600">{t('upload.complete')}</p>
      <p className="text-sm text-gray-500">
        {completedCount} {t('upload.success_count')}, {errorCount} {t('upload.error_count')}
      </p>
      <button
        onClick={onReset}
        className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        <Upload className="mr-2 inline h-4 w-4" />
        {t('upload.load_more')}
      </button>
    </div>
  );
}
