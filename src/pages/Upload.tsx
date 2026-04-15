import { useEffect } from 'react';
import { Upload as UploadIcon } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useI18n } from '@/contexts/I18nContext';
import { StatusCards } from '@/components/upload/StatusCards';
import { DropZone } from '@/components/upload/DropZone';
import { UploadResultList } from '@/components/upload/UploadResultList';
import { ProcessingOverlay } from '@/components/upload/ProcessingOverlay';
import { InstructionsCard } from '@/components/upload/InstructionsCard';
import { useUploadDeps } from '@/hooks/useUploadDeps';
import { useUploadQueue } from '@/hooks/useUploadQueue';
import { useTenant } from '@/contexts/TenantContext';
import { queryKeys } from '@/lib/queryKeys';

export default function Upload() {
  const { t } = useI18n();
  const { tenant, isOverLimit, invoicesUsed, invoicesLimit } = useTenant();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    const oauth = searchParams.get('oauth');
    if (oauth === 'success') {
      const email = searchParams.get('email');
      toast.success(`Conta Google ligada${email ? ` (${email})` : ''}`);
      qc.invalidateQueries({ queryKey: queryKeys.oauthTokens });
      qc.invalidateQueries({ queryKey: ['google-token'] });
      setSearchParams((p) => { p.delete('oauth'); p.delete('email'); p.delete('company_id'); return p; });
    } else if (oauth === 'error') {
      toast.error(searchParams.get('message') || 'Erro ao ligar conta Google');
      setSearchParams((p) => { p.delete('oauth'); p.delete('message'); return p; });
    }
  }, [searchParams, setSearchParams, qc]);

  const { userId, companyId, accessToken, ready, noGoogle, needsReauth, primaryEmail, loading } = useUploadDeps();
  const {
    files, isProcessing, currentIndex, rateLimitError,
    completedCount, errorCount, totalCount, progress,
    handleFiles, resetUpload, dismissRateLimit,
  } = useUploadQueue(userId, accessToken, companyId, t, tenant?.id);

  const hasFiles = files.length > 0;

  return (
    <div className="animate-fade-in space-y-4 sm:space-y-6">
      <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900 sm:text-2xl">
        <UploadIcon className="h-5 w-5" />
        {t('upload.title')}
      </h1>

      <StatusCards
        loading={loading} ready={ready} noGoogle={noGoogle}
        needsReauth={needsReauth} primaryEmail={primaryEmail} userId={userId}
        refreshError={null} rateLimitError={rateLimitError}
        onRetryToken={() => {}} onDismissRateLimit={dismissRateLimit}
      />

      {isOverLimit && (
        <div className="rounded-xl border border-destructive/50 bg-destructive/5 p-4 text-center">
          <p className="font-medium text-destructive">Limite de faturas atingido</p>
          <p className="text-sm text-muted-foreground mt-1">
            Utilizou {invoicesUsed} / {invoicesLimit} faturas este mês.
            Passe para o plano superior para continuar.
          </p>
        </div>
      )}

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
            disabled={isProcessing || !ready || loading || isOverLimit}
            hasFiles={hasFiles}
          />
        )}
      </div>

      <UploadResultList files={files} isProcessing={isProcessing} onClear={resetUpload} />

      {!hasFiles && !loading && <InstructionsCard />}
    </div>
  );
}
