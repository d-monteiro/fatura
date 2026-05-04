import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Ban, CheckCircle2, AlertTriangle, Loader2, Clock, KeyRound } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { queryKeys, invalidateInvoiceLists } from '@/lib/queryKeys';
import { useI18n } from '@/contexts/I18nContext';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { SyncJobStatusBadge, SyncJobTriggerBadge } from '@/components/admin/SyncJobBadges';
import type { SyncJob, SyncJobCounts } from '@/types/sync';
import { isSyncJobTerminal } from '@/types/sync';
import { redirectToGoogleOAuth } from '@/lib/google/oauth';
import type { TranslationKey } from '@/lib/i18n';

const STATUS_ROWS: Array<{ key: string; labelKey: TranslationKey }> = [
  { key: 'discovered', labelKey: 'sync.discovered' },
  { key: 'fetching', labelKey: 'sync.fetching' },
  { key: 'analyzing', labelKey: 'sync.analyzing' },
  { key: 'extracted', labelKey: 'sync.extracted' },
  { key: 'completed', labelKey: 'sync.completed' },
  { key: 'rejected', labelKey: 'sync.rejected' },
  { key: 'duplicate', labelKey: 'sync.duplicate' },
  { key: 'review', labelKey: 'sync.review' },
  { key: 'failed_permanent', labelKey: 'sync.failed_permanent' },
  { key: 'cancelled', labelKey: 'sync.cancelled_count' },
];

// Items que passaram pelo Gemini ou ficaram rejeitados após análise.
// Usado como divisor do ETA — exclui rejected/duplicate decididos no fetch
// (sem chamada Gemini) para o cálculo não ficar enganosamente optimista.
const ETA_DIVISOR_KEYS = ['completed', 'failed_permanent', 'review'] as const;
// Activos no pipeline: tudo o que ainda vai puxar workers.
const PIPELINE_KEYS = ['discovered', 'fetching', 'analyzing', 'extracted'] as const;
// Resolvidos (terminal) — para denominador da barra principal.
const RESOLVED_KEYS = [
  'completed', 'rejected', 'duplicate', 'failed_permanent', 'cancelled', 'review',
] as const;

function count(c: SyncJobCounts | null | undefined, key: string): number {
  return c?.[key] ?? 0;
}

function sumByKeys(c: SyncJobCounts | null | undefined, keys: ReadonlyArray<string>): number {
  if (!c) return 0;
  return keys.reduce((acc, k) => acc + count(c, k), 0);
}

function formatEta(job: SyncJob, t: (k: TranslationKey) => string): string {
  if (isSyncJobTerminal(job.status)) return '—';
  const c = job.counts_by_status;
  const active = sumByKeys(c, PIPELINE_KEYS);
  if (active === 0) return t('sync.eta_calculating');
  const analysed = sumByKeys(c, ETA_DIVISOR_KEYS);
  const elapsedMs = Date.now() - new Date(job.started_at).getTime();
  // Heurística mínima: precisamos de pelo menos 5 itens analisados E 60s de
  // amostra para o ratio ser estável. Caso contrário ETA dá saltos de 10x.
  if (analysed < 5 || elapsedMs < 60_000) return t('sync.eta_calculating');
  const msPerItem = elapsedMs / analysed;
  const etaMs = msPerItem * active;
  if (etaMs < 60_000) return '~1 min';
  const minutes = Math.ceil(etaMs / 60_000);
  if (minutes < 60) return `~${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins === 0 ? `~${hours}h` : `~${hours}h ${mins}min`;
}

export default function SyncProgress() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { t } = useI18n();
  const { user } = useAuth();
  const notifiedTerminalRef = useRef(false);
  const cancelInitiatedRef = useRef(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [reauthing, setReauthing] = useState(false);

  const { data: job, isLoading, error } = useQuery<SyncJob | null>({
    queryKey: queryKeys.syncJob(jobId ?? null),
    enabled: !!jobId,
    queryFn: async () => {
      const { data, error: qErr } = await supabase
        .from('sync_jobs').select('*').eq('id', jobId!).maybeSingle();
      if (qErr) throw qErr;
      return (data as SyncJob | null) ?? null;
    },
    refetchInterval: (query) => {
      const j = query.state.data as SyncJob | null;
      if (!j) return 5_000;
      return isSyncJobTerminal(j.status) ? false : 5_000;
    },
  });

  // Toast de transição para terminal — só dispara quando a transição é
  // descoberta pelo polling (não pelo próprio user via cancel button).
  // cancelInitiatedRef evita o segundo toast contraditório.
  useEffect(() => {
    if (!job || notifiedTerminalRef.current) return;
    if (job.status === 'done') {
      const c = job.counts_by_status;
      const completed = count(c, 'completed');
      const total = sumByKeys(c, RESOLVED_KEYS);
      toast.success(`${t('sync.progress_done')} — ${completed} fatura(s), ${total} item(s)`);
      invalidateInvoiceLists(qc);
      notifiedTerminalRef.current = true;
    } else if (job.status === 'error') {
      toast.error(`${t('sync.progress_error')}: ${job.error_message ?? ''}`);
      notifiedTerminalRef.current = true;
    } else if (job.status === 'cancelled') {
      // Só mostra se não foi o próprio user a cancelar nesta sessão.
      if (!cancelInitiatedRef.current) toast.info(t('sync.progress_cancelled'));
      notifiedTerminalRef.current = true;
    }
  }, [job, qc, t]);

  const cancelMutation = useMutation({
    mutationFn: async () => {
      cancelInitiatedRef.current = true;
      const { error: rpcErr } = await supabase.rpc('cancel_sync_job', { p_job_id: jobId });
      if (rpcErr) throw rpcErr;
    },
    onSuccess: () => {
      toast.success(t('sync.cancelled'));
      qc.invalidateQueries({ queryKey: queryKeys.syncJob(jobId ?? null) });
      qc.invalidateQueries({ queryKey: ['sync-jobs', 'active'] });
    },
    onError: (e) => {
      cancelInitiatedRef.current = false;
      toast.error(e instanceof Error ? e.message : t('sync.cancel_failed'));
    },
  });

  const handleReauth = async () => {
    if (!user) return;
    try {
      setReauthing(true);
      await redirectToGoogleOAuth({ userId: user.id, source: 'settings', promptSelect: true });
    } catch (e) {
      setReauthing(false);
      toast.error(e instanceof Error ? e.message : t('sync.error'));
    }
  };

  const progress = useMemo(() => {
    if (!job) return { value: 0, max: 1, pct: 0, indeterminate: true };
    // Durante 'discovering' o total real é desconhecido — mais discovered
    // entra a cada página Gmail. Mostrar barra indeterminada evita a
    // percentagem regredir enquanto o trabalho avança.
    if (job.status === 'queued' || job.status === 'discovering') {
      return { value: 0, max: 1, pct: 0, indeterminate: true };
    }
    const resolved = sumByKeys(job.counts_by_status, RESOLVED_KEYS);
    const active = sumByKeys(job.counts_by_status, PIPELINE_KEYS);
    const total = resolved + active;
    if (total === 0) return { value: 0, max: 1, pct: 0, indeterminate: false };
    return {
      value: resolved,
      max: total,
      pct: Math.round((resolved / total) * 100),
      indeterminate: false,
    };
  }, [job]);

  if (!jobId) {
    return <div className="p-6 text-sm text-muted-foreground">Job inválido.</div>;
  }

  if (isLoading) {
    return (
      <div className="p-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> {t('generic.loading')}
      </div>
    );
  }

  // Distinguir erro de fetch (rede/RLS) de "job não existe".
  if (error) {
    return (
      <div className="p-6 max-w-2xl space-y-4">
        <div className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-5 w-5" />
          <h1 className="text-xl font-semibold">{t('sync.error_loading')}</h1>
        </div>
        <p className="text-sm text-muted-foreground break-words">
          {error instanceof Error ? error.message : String(error)}
        </p>
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-1" /> {t('sync.back')}
        </Button>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="p-6 max-w-2xl space-y-4">
        <div className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-5 w-5" />
          <h1 className="text-xl font-semibold">{t('sync.not_found_title')}</h1>
        </div>
        <p className="text-sm text-muted-foreground">{t('sync.not_found_body')}</p>
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-1" /> {t('sync.back')}
        </Button>
      </div>
    );
  }

  const terminal = isSyncJobTerminal(job.status);
  const heading =
    job.status === 'done' ? t('sync.progress_done')
      : job.status === 'cancelled' ? t('sync.progress_cancelled')
      : job.status === 'error' ? t('sync.progress_error')
      : job.status === 'paused_reauth' ? t('sync.progress_paused_reauth')
      : t('sync.progress_title');

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="-ml-2">
          <ArrowLeft className="h-4 w-4 mr-1" /> {t('sync.back')}
        </Button>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          {job.status === 'done' && <CheckCircle2 className="h-5 w-5 text-green-600" />}
          {job.status === 'error' && <AlertTriangle className="h-5 w-5 text-destructive" />}
          {job.status === 'paused_reauth' && <KeyRound className="h-5 w-5 text-amber-600" />}
          {!terminal && job.status !== 'paused_reauth' && (
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          )}
          <h1 className="text-xl sm:text-2xl font-bold">{heading}</h1>
        </div>
        <div className="flex items-center gap-2 text-sm flex-wrap">
          <SyncJobStatusBadge status={job.status} />
          <SyncJobTriggerBadge trigger={job.trigger} />
          <span className="text-muted-foreground">
            · iniciado {new Date(job.started_at).toLocaleString('pt-PT')}
          </span>
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-4 sm:p-5 space-y-4 shadow-card">
        {progress.indeterminate ? (
          <>
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('sync.discovering_emails')}
              </span>
              <span className="text-muted-foreground inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" /> {t('sync.eta')}: {t('sync.eta_calculating')}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full w-full animate-pulse bg-primary/40" />
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">
                {progress.value} / {progress.max} ({progress.pct}%)
              </span>
              <span className="text-muted-foreground inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" /> {t('sync.eta')}: {formatEta(job, t)}
              </span>
            </div>
            <Progress value={progress.value} max={progress.max} />
          </>
        )}
        <div className="text-xs text-muted-foreground">
          {job.total_messages_seen} {t('sync.emails_read_suffix')} ·{' '}
          {job.total_invoices_created} {t('sync.invoices_discovered_suffix')}
        </div>
      </div>

      <div className="rounded-2xl border bg-white shadow-card overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/30 text-xs font-medium uppercase tracking-wide">
          {t('sync.state')}
        </div>
        <div className="divide-y">
          {STATUS_ROWS.map((row) => {
            const n = count(job.counts_by_status, row.key);
            if (n === 0) return null;
            return (
              <div key={row.key} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span>{t(row.labelKey)}</span>
                <span className="font-mono tabular-nums">{n}</span>
              </div>
            );
          })}
          {Object.keys(job.counts_by_status ?? {}).length === 0 && (
            <div className="px-4 py-6 text-center text-xs text-muted-foreground">
              {t('sync.starting_label')}
            </div>
          )}
        </div>
      </div>

      {job.error_message && (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm flex gap-2">
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
          <div className="break-words">{job.error_message}</div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {job.status === 'paused_reauth' && (
          <Button onClick={handleReauth} disabled={reauthing} className="gap-1">
            <KeyRound className="h-4 w-4" />
            {reauthing ? t('sync.starting') : t('sync.reauth_cta')}
          </Button>
        )}
        {!terminal && (
          <Button
            variant="outline"
            onClick={() => setConfirmCancelOpen(true)}
            disabled={cancelMutation.isPending}
            className="gap-1"
          >
            <Ban className="h-4 w-4" />
            {cancelMutation.isPending ? t('sync.cancelling') : t('sync.cancel')}
          </Button>
        )}
        <Button variant="ghost" onClick={() => navigate('/invoices')}>
          {t('sync.view_invoices_cta')}
        </Button>
      </div>

      <AlertDialog open={confirmCancelOpen} onOpenChange={setConfirmCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('sync.cancel_confirm')}</AlertDialogTitle>
            <AlertDialogDescription>{t('sync.cancel_confirm_body')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('sync.cancel_keep')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => cancelMutation.mutate()}>
              {t('sync.cancel')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
