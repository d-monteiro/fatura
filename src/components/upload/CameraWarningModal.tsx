import { Camera, Info } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';

interface CameraWarningModalProps {
  onConfirm: () => void;
  onCancel: () => void;
}

export function CameraWarningModal({ onConfirm, onCancel }: CameraWarningModalProps) {
  const { t } = useI18n();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm animate-in fade-in rounded-xl border bg-white p-6 shadow-lg">
        <div className="flex items-center gap-2 text-amber-600 font-semibold mb-4">
          <Info className="h-5 w-5" />
          {t('upload.camera_tip_title')}
        </div>
        <div className="text-sm text-gray-600 space-y-2 mb-6">
          <p>Pour de meilleurs résultats :</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>{t('upload.camera_tip_1')}</li>
            <li>{t('upload.camera_tip_2')}</li>
            <li>{t('upload.camera_tip_3')}</li>
            <li>{t('upload.camera_tip_4')}</li>
          </ul>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {t('action.cancel')}
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white shadow-sm hover:opacity-90 transition-all"
          >
            <Camera className="h-4 w-4" />
            {t('upload.camera_confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
