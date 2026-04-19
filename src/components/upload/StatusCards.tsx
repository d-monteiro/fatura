import { Link } from 'react-router-dom';
import {
  Loader2, CheckCircle, AlertTriangle, AlertCircle, RefreshCw,
} from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { redirectToGoogleOAuth } from '@/lib/google/oauth';

interface StatusCardsProps {
  loading: boolean;
  ready: boolean;
  noGoogle: boolean;
  needsReauth: boolean;
  primaryEmail: string | null;
  userId: string | null;
  refreshError: string | null;
  rateLimitError: string | null;
  onRetryToken: () => void;
  onDismissRateLimit: () => void;
}

export function StatusCards({
  loading, ready, noGoogle, needsReauth, primaryEmail, userId,
  refreshError, rateLimitError, onRetryToken, onDismissRateLimit,
}: StatusCardsProps) {
  const { t } = useI18n();

  const connect = (loginHint?: string) => {
    if (!userId) return;
    void redirectToGoogleOAuth({ source: 'upload', loginHint, promptSelect: !loginHint })
      .catch((e: unknown) => console.error('[oauth]', e));
  };

  if (loading) {
    return (
      <Card color="blue" icon={<Loader2 className="h-5 w-5 text-blue-600 shrink-0 animate-spin" />}>
        <p className="font-medium text-blue-800">{t('upload.checking_auth')}</p>
        <p className="text-sm text-blue-700">{t('upload.checking_auth_desc')}</p>
      </Card>
    );
  }

  return (
    <>
      {refreshError && (
        <Card color="red" icon={<AlertCircle className="h-5 w-5 text-red-600 shrink-0" />}>
          <div className="flex-1">
            <p className="font-medium text-red-800">{t('upload.token_error')}</p>
            <p className="text-sm text-red-700">{refreshError}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={onRetryToken} className="flex items-center gap-1 rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-100">
              <RefreshCw className="h-4 w-4" />{t('upload.retry')}
            </button>
            <Link to="/settings" className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-100">
              {t('upload.go_settings')}
            </Link>
          </div>
        </Card>
      )}

      {rateLimitError && (
        <Card color="orange" icon={<AlertTriangle className="h-5 w-5 text-orange-600 shrink-0" />}>
          <div className="flex-1">
            <p className="font-medium text-orange-800">{t('upload.rate_limit')}</p>
            <p className="text-sm text-orange-700">{rateLimitError}</p>
          </div>
          <button onClick={onDismissRateLimit} className="rounded-md border border-orange-300 px-3 py-1.5 text-sm text-orange-700 hover:bg-orange-100">
            {t('upload.understood')}
          </button>
        </Card>
      )}

      {needsReauth && !refreshError && (
        <Card color="orange" icon={<AlertTriangle className="h-5 w-5 text-orange-600 shrink-0" />}>
          <div className="flex-1">
            <p className="font-medium text-orange-800">Permissões do Drive em falta</p>
            <p className="text-sm text-orange-700">
              A conta {primaryEmail ?? 'Google'} não tem acesso ao Drive, onde os PDFs são guardados. Volte a autenticar para continuar.
            </p>
          </div>
          <button
            onClick={() => connect(primaryEmail ?? undefined)}
            className="rounded-md border border-orange-300 px-3 py-1.5 text-sm font-medium text-orange-700 hover:bg-orange-100"
          >
            Reautenticar
          </button>
        </Card>
      )}

      {noGoogle && !refreshError && (
        <Card color="yellow" icon={<AlertTriangle className="h-5 w-5 text-yellow-600 shrink-0" />}>
          <div className="flex-1">
            <p className="font-medium text-yellow-800">{t('upload.no_account')}</p>
            <p className="text-sm text-yellow-700">{t('upload.no_account_desc')}</p>
          </div>
          <button
            onClick={() => connect()}
            disabled={!userId}
            className="rounded-md border border-yellow-300 px-3 py-1.5 text-sm font-medium text-yellow-700 hover:bg-yellow-100 disabled:opacity-50"
          >
            {t('upload.configure_account')}
          </button>
        </Card>
      )}

      {ready && !refreshError && (
        <Card color="green" icon={<CheckCircle className="h-5 w-5 text-green-600 shrink-0" />}>
          <p className="font-medium text-green-800">{t('upload.ready')}</p>
          <p className="text-sm text-green-700">{t('upload.ready_desc')}</p>
        </Card>
      )}
    </>
  );
}

const COLOR_MAP = {
  blue: 'border-blue-200 bg-blue-50',
  green: 'border-green-200 bg-green-50',
  yellow: 'border-yellow-200 bg-yellow-50',
  red: 'border-red-200 bg-red-50',
  orange: 'border-orange-200 bg-orange-50',
} as const;

function Card({ color, icon, children }: {
  color: keyof typeof COLOR_MAP;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex items-center gap-3 rounded-xl border p-4 ${COLOR_MAP[color]}`}>
      {icon}
      <div className="flex flex-1 items-center gap-3">{children}</div>
    </div>
  );
}
