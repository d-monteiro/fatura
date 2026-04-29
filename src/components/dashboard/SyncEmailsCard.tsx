import { useState } from 'react';
import { Mail, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useI18n } from '@/contexts/I18nContext';
import { supabase } from '@/lib/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { invalidateInvoiceLists } from '@/lib/queryKeys';
import { useAuth } from '@/contexts/AuthContext';
import { hasGmailScopes } from '@/lib/google/scopes';

interface SyncResult {
  discovered: number;
  duplicates: number;
  skipped: number;
  errors: number;
  messagesFound: number;
  attachmentsSeen: number;
}

export function SyncEmailsCard() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);

  const { data: hasGmail = false } = useQuery({
    queryKey: ['has-gmail-account', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from('user_oauth_tokens')
        .select('scopes').eq('user_id', user!.id);
      return ((data as { scopes: string[] | null }[] | null) ?? [])
        .some((row) => hasGmailScopes(row.scopes));
    },
  });

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
        discovered: data.total_discovered ?? 0,
        duplicates: data.total_duplicates ?? 0,
        skipped: data.total_skipped ?? 0,
        errors: data.total_errors ?? 0,
        messagesFound: data.total_messages_found ?? 0,
        attachmentsSeen: data.total_attachments_seen ?? 0,
      };
      setResult(r);

      if (data.code === 'no_accounts') {
        toast.info(data.message);
      } else if (r.discovered > 0) {
        toast.success(`${r.discovered} ${t('sync.processed')}`);
        invalidateInvoiceLists(qc);
      } else if (r.duplicates > 0) {
        toast.info(`${r.duplicates} ${t('sync.duplicates')}`);
      } else if (r.errors > 0) {
        toast.error(t('sync.errors_found'));
      } else if (r.messagesFound === 0) {
        toast.info(t('sync.no_emails'));
      } else if (r.skipped > 0) {
        toast.info(`${r.skipped} ${t('sync.skipped_only')}`);
      } else {
        // Gmail devolveu mensagens mas nenhuma tinha anexo elegível
        toast.info(`${r.messagesFound} ${t('sync.no_matches')}`);
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
            {result.messagesFound} emails · {result.attachmentsSeen} anexos · {result.discovered} nova(s)
          </span>
        )}
        {hasGmail ? (
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
        ) : (
          <Link
            to="/settings"
            className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100"
            title="Liga primeiro uma conta Google em Definições"
          >
            <AlertCircle className="h-4 w-4" />
            Ligar Google
          </Link>
        )}
      </div>
    </div>
  );
}
