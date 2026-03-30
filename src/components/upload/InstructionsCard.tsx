import { useI18n } from '@/contexts/I18nContext';

const MAX_FILES = 10;

export function InstructionsCard() {
  const { t } = useI18n();

  return (
    <div className="rounded-xl border bg-white p-5">
      <h3 className="mb-3 text-sm font-semibold text-gray-700">{t('upload.how_title')}</h3>
      <ol className="list-decimal list-inside space-y-1.5 text-sm text-gray-600">
        <li>{t('upload.how_1').replace('{max}', String(MAX_FILES))}</li>
        <li>{t('upload.how_2')}</li>
        <li>{t('upload.how_3')}</li>
        <li>{t('upload.how_4')}</li>
      </ol>
      <p className="mt-4 border-t pt-3 text-xs text-gray-400">
        {t('upload.how_tip')}
      </p>
    </div>
  );
}
