import { useState } from 'react';
import { Mail, Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@/contexts/I18nContext';
import { supabase } from '@/lib/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { invalidateInvoiceLists } from '@/lib/queryKeys';

interface SyncResult {
  processed: number;
  duplicates: number;
  skipped: number;
  errors: number;
}

export function SyncEmailsCard() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);

  async function handleSync() {
    setSyncing(true);
    setResult(null);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const { data: { session } } = await supabase.auth.getSession();
      if (!supabaseUrl || !anonKey || !session?.access_token) {
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
        toast.error(data.error || data.message || `${t('sync.error')} (HTTP ${response.status})`);
        return;
      }

      const r: SyncResult = {
        processed: data.total_processed ?? 0,
        duplicates: data.total_duplicates ?? 0,
        skipped: data.total_skipped ?? 0,
        errors: data.total_errors ?? 0,
      };
      setResult(r);

      if (data.code === 'no_accounts') {
        toast.info(data.message);
      } else if (r.processed > 0) {
        toast.success(`${r.processed} ${t('sync.processed')}`);
        invalidateInvoiceLists(qc);
      } else if (r.duplicates > 0) {
        toast.info(`${r.duplicates} ${t('sync.duplicates')}`);
      } else {
        toast.info(t('sync.no_emails'));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('sync.error'));
    } finally {
      setSyncing(false);
    }
  }

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
        {result && (
          <span className="inline-flex items-center gap-1 text-xs text-gray-600">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
            {result.processed} {t('sync.processed')} &middot; {result.duplicates} {t('sync.duplicates')}
          </span>
        )}
        <button
          onClick={handleSync}
          disabled={syncing}
          className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {syncing ? (
            <><Loader2 className="h-4 w-4 animate-spin" />{t('auto.checking')}</>
          ) : (
            <><Mail className="h-4 w-4" />{t('auto.check_now')}</>
          )}
        </button>
      </div>
    </div>
  );
}
