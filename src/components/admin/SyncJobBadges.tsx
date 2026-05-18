import { Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/contexts/I18nContext';
import type { SyncJobStatus, SyncJobTrigger } from '@/types/sync';
import type { TranslationKey } from '@/lib/i18n';

const STATUS_LABEL_KEY: Record<SyncJobStatus, TranslationKey> = {
  queued: 'sync.status_queued',
  discovering: 'sync.status_discovering',
  processing: 'sync.status_processing',
  done: 'sync.status_done',
  paused_reauth: 'sync.status_paused_reauth',
  cancelled: 'sync.status_cancelled',
  error: 'sync.status_error',
};

// 'discovering' e 'processing' partilhavam variant 'default' — admin não
// distinguia fases. Mantemos a mesma cor de base mas ícone diferente.
const STATUS_VARIANT: Record<SyncJobStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  queued: 'secondary',
  discovering: 'secondary',
  processing: 'default',
  done: 'outline',
  paused_reauth: 'destructive',
  cancelled: 'outline',
  error: 'destructive',
};

const STATUS_HAS_SPINNER: ReadonlyArray<SyncJobStatus> = ['discovering', 'processing'];

export function SyncJobStatusBadge({ status }: { status: SyncJobStatus }) {
  const { t } = useI18n();
  const showSpinner = STATUS_HAS_SPINNER.includes(status);
  return (
    <Badge variant={STATUS_VARIANT[status]} className="inline-flex items-center gap-1">
      {showSpinner && <Loader2 className="h-3 w-3 animate-spin" />}
      {t(STATUS_LABEL_KEY[status])}
    </Badge>
  );
}

const TRIGGER_LABEL_KEY: Record<SyncJobTrigger, TranslationKey> = {
  cron: 'sync.trigger_cron',
  manual: 'sync.trigger_manual',
  backfill_6m: 'sync.trigger_backfill_6m',
  admin: 'sync.trigger_admin',
};

export function SyncJobTriggerBadge({ trigger }: { trigger: SyncJobTrigger }) {
  const { t } = useI18n();
  return <Badge variant="outline">{t(TRIGGER_LABEL_KEY[trigger])}</Badge>;
}
