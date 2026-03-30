import { Upload as UploadIcon } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { StatusCards } from '@/components/upload/StatusCards';
import { DropZone } from '@/components/upload/DropZone';
import { UploadResultList } from '@/components/upload/UploadResultList';
import { ProcessingOverlay } from '@/components/upload/ProcessingOverlay';
import { InstructionsCard } from '@/components/upload/InstructionsCard';
import { useUploadDeps } from '@/hooks/useUploadDeps';
import { useUploadQueue } from '@/hooks/useUploadQueue';

export default function Upload() {
  const { t } = useI18n();
  const { userId, companyId, accessToken, ready, noGoogle, loading } = useUploadDeps();
  const {
    files, isProcessing, currentIndex, rateLimitError,
    completedCount, errorCount, totalCount, progress,
    handleFiles, resetUpload, dismissRateLimit,
  } = useUploadQueue(userId, accessToken, companyId, t);

  const hasFiles = files.length > 0;

  return (
    <div className="animate-fade-in space-y-4 sm:space-y-6">
      <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900 sm:text-2xl">
        <UploadIcon className="h-5 w-5" />
        {t('upload.title')}
      </h1>

      <StatusCards
        loading={loading} ready={ready} noGoogle={noGoogle}
        refreshError={null} rateLimitError={rateLimitError}
        onRetryToken={() => {}} onDismissRateLimit={dismissRateLimit}
      />

      <div className="rounded-xl border bg-white p-4 sm:p-6">
        {hasFiles ? (
          <ProcessingOverlay
            isProcessing={isProcessing} currentIndex={currentIndex}
            totalCount={totalCount} completedCount={completedCount}
            errorCount={errorCount} progress={progress} onReset={resetUpload}
          />
        ) : (
          <DropZone
            onFiles={handleFiles}
            disabled={isProcessing || !ready || loading}
            hasFiles={hasFiles}
          />
        )}
      </div>

      <UploadResultList files={files} isProcessing={isProcessing} onClear={resetUpload} />

      {!hasFiles && !loading && <InstructionsCard />}
    </div>
  );
}
