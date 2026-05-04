import { Mail, Loader2, AlertCircle } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useI18n } from '@/contexts/I18nContext';
import { useTenant } from '@/contexts/TenantContext';
import { supabase } from '@/lib/supabase/client';
import { queryKeys } from '@/lib/queryKeys';
import { SyncJobStatusBadge } from '@/components/admin/SyncJobBadges';
import type { SyncJob } from '@/types/sync';

export function SyncEmailsCard() {
  const { t } = useI18n();
  const { tenant } = useTenant();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const tenantId = tenant?.id ?? null;

  // Conta Gmail vive por tenant (não por user). Membro convidado deve ver
  // "Verificar agora" se o owner já ligou Gmail à empresa — RLS filtra por
  // get_user_tenant_ids(), portanto qualquer membro lê.
  const { data: hasGmail = false } = useQuery({
    queryKey: ['has-gmail-account', 'tenant', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase.from('email_accounts')
        .select('id')
        .eq('tenant_id', tenantId!)
        .eq('is_active', true)
        .limit(1);
      return Array.isArray(data) && data.length > 0;
    },
  });

  const { data: activeJob } = useQuery<SyncJob | null>({
    queryKey: queryKeys.syncJobActive(tenantId),
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase
        .from('sync_jobs')
        .select('*')
        .eq('tenant_id', tenantId!)
        .in('status', ['queued', 'discovering', 'processing', 'paused_reauth'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data as SyncJob | null) ?? null;
    },
    refetchInterval: 10_000,
  });

  const startMutation = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error('Sem tenant activo');
      const { data, error } = await supabase.rpc('start_sync_job', {
        p_tenant_id: tenantId,
        p_trigger: 'manual',
        p_email_account_id: null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (jobId) => {
      toast.success(t('sync.job_started'), { description: t('sync.job_started_desc') });
      qc.invalidateQueries({ queryKey: queryKeys.syncJobActive(tenantId) });
      navigate(`/sync/${jobId}`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t('sync.error')),
  });

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-card sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
          <Mail className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900">{t('auto.check_emails')}</p>
          <p className="text-xs text-gray-500">{t('auto.check_emails_desc')}</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {!hasGmail ? (
          <Link
            to="/settings"
            className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100"
            title="Liga primeiro uma conta Google em Definições"
          >
            <AlertCircle className="h-4 w-4" />
            Ligar Google
          </Link>
        ) : activeJob ? (
          <button
            onClick={() => navigate(`/sync/${activeJob.id}`)}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border bg-white px-4 py-2 text-sm font-medium hover:bg-muted/50"
          >
            <SyncJobStatusBadge status={activeJob.status} />
            <span>{t('sync.view_progress')}</span>
          </button>
        ) : (
          <button
            onClick={() => startMutation.mutate()}
            disabled={startMutation.isPending}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {startMutation.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin" />{t('sync.starting')}</>
            ) : (
              <><Mail className="h-4 w-4" />{t('sync.start_now')}</>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
