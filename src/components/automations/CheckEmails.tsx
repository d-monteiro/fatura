import { useState } from 'react';
import { Inbox, Mail, Zap, HardDrive, CheckCircle2, Loader2 } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { supabase } from '@/lib/supabase/client';
import { toast } from 'sonner';
import type { SyncResult } from './useAutomationsData';

export function CheckEmails() {
  const { t } = useI18n();
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);

  async function handleSync() {
    setSyncing(true);
    setResult(null);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      if (!supabaseUrl || !anonKey) {
        toast.error(t('sync.error'));
        return;
      }

      // Get user session JWT for auth
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error(t('sync.error'));
        return;
      }

      const response = await fetch(`${supabaseUrl}/functions/v1/sync-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: anonKey,
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        toast.error(data.error || t('sync.error'));
        return;
      }

      const syncResult: SyncResult = {
        processed: data.total_processed || 0,
        duplicates: data.total_duplicates || 0,
        skipped: data.total_skipped || 0,
        errors: data.total_errors || 0,
      };
      setResult(syncResult);

      if (syncResult.processed > 0) {
        toast.success(`${syncResult.processed} ${t('sync.processed')}`);
      } else if (syncResult.duplicates > 0) {
        toast.info(`${syncResult.duplicates} ${t('sync.duplicates')}`);
      } else {
        toast.info(t('sync.no_emails'));
      }
    } catch {
      toast.error(t('sync.error'));
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="border border-blue-200 bg-blue-50/50 rounded-xl p-6 space-y-4">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2 text-blue-800">
          <Inbox size={20} />
          {t('auto.check_emails')}
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">{t('auto.check_emails_desc')}</p>
      </div>

      <button
        onClick={handleSync}
        disabled={syncing}
        className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg hover:opacity-90 text-sm font-medium disabled:opacity-50 w-full sm:w-auto justify-center"
      >
        {syncing ? (
          <><Loader2 className="h-4 w-4 animate-spin" />{t('auto.checking')}</>
        ) : (
          <><Mail className="h-4 w-4" />{t('auto.check_now')}</>
        )}
      </button>

      {result && <SyncResultGrid result={result} />}

      <div className="text-xs text-muted-foreground space-y-1">
        <StepLine icon={Mail} text={t('auto.step_read')} />
        <StepLine icon={Zap} text={t('auto.step_analyze')} />
        <StepLine icon={HardDrive} text={t('auto.step_store')} />
        <StepLine icon={CheckCircle2} text={t('auto.step_mark')} />
      </div>
    </div>
  );
}

function SyncResultGrid({ result }: { result: SyncResult }) {
  const { t } = useI18n();
  const items = [
    { value: result.processed, label: t('auto.result_processed'), bg: 'bg-green-100', text: 'text-green-700', sub: 'text-green-600' },
    { value: result.duplicates, label: t('auto.result_duplicates'), bg: 'bg-yellow-100', text: 'text-yellow-700', sub: 'text-yellow-600' },
    { value: result.skipped, label: t('auto.result_skipped'), bg: 'bg-gray-100', text: 'text-gray-700', sub: 'text-gray-600' },
    { value: result.errors, label: t('auto.result_errors'), bg: 'bg-red-100', text: 'text-red-700', sub: 'text-red-600' },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
      {items.map((item) => (
        <div key={item.label} className={`text-center p-2 rounded-lg ${item.bg}`}>
          <p className={`text-lg font-bold ${item.text}`}>{item.value}</p>
          <p className={`text-xs ${item.sub}`}>{item.label}</p>
        </div>
      ))}
    </div>
  );
}

function StepLine({ icon: Icon, text }: { icon: React.ComponentType<{ className?: string }>; text: string }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="h-3 w-3 mt-0.5 shrink-0" />
      <span>{text}</span>
    </div>
  );
}
