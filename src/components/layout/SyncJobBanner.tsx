import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Loader2, KeyRound } from 'lucide-react';
import { useActiveSyncJob } from '@/hooks/useActiveSyncJob';
import { useI18n } from '@/contexts/I18nContext';
import { SyncJobStatusBadge } from '@/components/admin/SyncJobBadges';
import type { SyncJob } from '@/types/sync';

// Banner global persistente — mostra-se em qualquer página enquanto há
// sync_job não-terminal. Substitui o SyncBanner antigo (que apontava
// para sync_runs).
export function SyncJobBanner({ tenantId }: { tenantId: string | null }) {
  const navigate = useNavigate();
  const { t } = useI18n();

  const { activeJob } = useActiveSyncJob(tenantId, {
    onTerminate: (job) => {
      if (job.status === 'done') {
        toast.success(t('sync.progress_done'), {
          description: formatDoneSummary(job),
          duration: 6000,
          action: {
            label: t('sync.view_progress'),
            onClick: () => navigate(`/sync/${job.id}`),
          },
        });
      } else if (job.status === 'error') {
        toast.error(t('sync.progress_error'), {
          description: job.error_message ?? undefined,
          duration: 10000,
          action: {
            label: t('sync.view_progress'),
            onClick: () => navigate(`/sync/${job.id}`),
          },
        });
      } else if (job.status === 'cancelled') {
        toast(t('sync.progress_cancelled'), { duration: 4000 });
      }
    },
  });

  if (!activeJob) return null;

  const isPausedReauth = activeJob.status === 'paused_reauth';
  const Icon = isPausedReauth ? KeyRound : Loader2;
  const iconClass = isPausedReauth ? 'text-amber-600' : 'animate-spin text-blue-600';
  const wrapClass = isPausedReauth
    ? 'border-amber-200 bg-amber-50 text-amber-900'
    : 'border-blue-200 bg-blue-50 text-blue-900';

  return (
    <div className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm ${wrapClass}`}>
      <Icon className={`h-4 w-4 flex-shrink-0 ${iconClass}`} />
      <div className="flex-1 min-w-0">
        <span>{t(isPausedReauth ? 'sync.progress_paused_reauth' : 'sync.banner_running')}</span>
      </div>
      <SyncJobStatusBadge status={activeJob.status} />
      <button
        type="button"
        onClick={() => navigate(`/sync/${activeJob.id}`)}
        className="text-xs font-medium underline underline-offset-2"
      >
        {t('sync.view_progress')}
      </button>
    </div>
  );
}

function formatDoneSummary(job: SyncJob): string {
  const c = job.counts_by_status ?? {};
  const inbox = (c.inbox ?? 0) + (c.completed ?? 0);
  const review = c.review ?? 0;
  const failed = (c.failed ?? 0) + (c.failed_permanent ?? 0);
  const rejected = c.rejected ?? 0;

  const parts: string[] = [];
  if (inbox > 0) parts.push(`${inbox} para inbox`);
  if (review > 0) parts.push(`${review} a rever`);
  if (rejected > 0) parts.push(`${rejected} ignoradas`);
  if (failed > 0) parts.push(`${failed} com erro`);

  if (parts.length === 0) return 'Sem novas faturas.';
  return parts.join(' · ');
}
