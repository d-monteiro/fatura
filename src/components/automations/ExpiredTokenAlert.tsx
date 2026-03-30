import { AlertCircle } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';

export function ExpiredTokenAlert() {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-3 p-4 rounded-lg bg-red-50 border border-red-200 mb-4">
      <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
      <div className="flex-1">
        <p className="font-medium text-red-800">{t('auto.token_expired')}</p>
        <p className="text-sm text-red-700">{t('auto.token_expired_desc')}</p>
      </div>
    </div>
  );
}
