import { CheckCircle, Trash2, X } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';

interface BulkActionBarProps {
  count: number;
  onApprove: () => void;
  onDelete: () => void;
  onClear: () => void;
  loading: boolean;
}

export function BulkActionBar({ count, onApprove, onDelete, onClear, loading }: BulkActionBarProps) {
  const { t } = useI18n();

  return (
    <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-gray-200 bg-white px-5 py-3 shadow-lg">
      <span className="text-sm font-medium text-gray-700">
        {count} {t('bulk.selected')}
      </span>
      <button
        onClick={onApprove}
        disabled={loading}
        className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
      >
        <CheckCircle className="h-4 w-4" />
        {t('bulk.approve')}
      </button>
      <button
        onClick={onDelete}
        disabled={loading}
        className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
      >
        <Trash2 className="h-4 w-4" />
        {t('bulk.delete')}
      </button>
      <button
        onClick={onClear}
        className="ml-1 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        title={t('action.cancel')}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
