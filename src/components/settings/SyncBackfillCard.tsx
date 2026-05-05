import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Calendar, History, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { useI18n } from '@/contexts/I18nContext';
import { useRole } from '@/hooks/useRole';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter,
  AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { queryKeys } from '@/lib/queryKeys';
import { SyncJobStatusBadge } from '@/components/admin/SyncJobBadges';
import { useActiveSyncJob } from '@/hooks/useActiveSyncJob';

// Backfill 3m custa ~63€ em Gemini — gating restrito a quem gere billing
// (owners). Member/readonly não vêem o card de todo. RPC valida o mesmo
// no servidor (defesa em profundidade).
export function SyncBackfillCard() {
  const { tenant } = useTenant();
  const { t } = useI18n();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { can } = useRole();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const tenantId = tenant?.id ?? null;

  const { activeJob } = useActiveSyncJob(tenantId);

  // Já houve um backfill_3m completo nas últimas 24h?
  // - Esconde o card para evitar custo duplicado.
  // - Refetch periódico para reflectir um backfill que terminou enquanto
  //   o user está em Settings (caso contrário ficava em cache 'false' e
  //   permitia accionar de novo).
  // - Janela 24h alinha com o rate-limit da RPC start_sync_job (B2).
  const { data: recentBackfill } = useQuery<boolean>({
    queryKey: ['sync-jobs', 'recent-backfill', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from('sync_jobs')
        .select('id')
        .eq('tenant_id', tenantId!)
        .eq('trigger', 'backfill_3m')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(1);
      return Array.isArray(data) && data.length > 0;
    },
    refetchInterval: 30_000,
  });

  const startMutation = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error('Sem tenant activo');
      const { data, error } = await supabase.rpc('start_sync_job', {
        p_tenant_id: tenantId,
        p_trigger: 'backfill_3m',
        p_email_account_id: null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (jobId) => {
      toast.success(t('sync.job_started'));
      qc.invalidateQueries({ queryKey: queryKeys.syncJobActive(tenantId) });
      qc.invalidateQueries({ queryKey: ['sync-jobs', 'recent-backfill', tenantId] });
      navigate(`/sync/${jobId}`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t('sync.error')),
  });

  if (!tenantId) return null;
  if (!can('manage_billing')) return null; // Custo €63 — só quem gere billing.
  if (recentBackfill) return null; // Já correu nas últimas 24h.

  const blocked = !!activeJob;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 shadow-card space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
          <History className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-gray-900">{t('backfill.title')}</div>
          <p className="text-sm text-gray-600 mt-1">{t('backfill.desc')}</p>
          <p className="text-xs text-gray-500 mt-2 inline-flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5" /> {t('backfill.estimate')}
          </p>
        </div>
      </div>

      {blocked && activeJob ? (
        <div className="flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <span>Há uma sincronização em curso —</span>
          <SyncJobStatusBadge status={activeJob.status} />
          <button
            type="button"
            className="underline ml-auto"
            onClick={() => navigate(`/sync/${activeJob.id}`)}
          >
            {t('sync.view_progress')}
          </button>
        </div>
      ) : (
        <div className="flex justify-end">
          <Button
            onClick={() => setConfirmOpen(true)}
            disabled={startMutation.isPending}
            className="gap-1"
          >
            {startMutation.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> {t('backfill.starting')}</>
            ) : (
              <><History className="h-4 w-4" /> {t('backfill.cta')}</>
            )}
          </Button>
        </div>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('backfill.confirm_title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('backfill.confirm_body')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('backfill.confirm_no')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => startMutation.mutate()}>
              {t('backfill.confirm_yes')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
