import { useCallback, useState, type DragEvent } from 'react';
import { Upload, FileWarning } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';

const ACCEPTED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf', 'image/heic', 'image/heif'];
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

interface DropZoneProps {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
}

export function DropZone({ onFiles, disabled }: DropZoneProps) {
  const { t } = useI18n();
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validate = useCallback((files: File[]): File[] => {
    const valid: File[] = [];
    for (const f of files) {
      if (f.size > MAX_SIZE) {
        setError(t('error.file_too_large'));
        continue;
      }
      if (!ACCEPTED_TYPES.includes(f.type)) {
        setError(t('error.invalid_format'));
        continue;
      }
      valid.push(f);
    }
    return valid;
  }, [t]);

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    setError(null);
    const files = validate(Array.from(e.dataTransfer.files));
    if (files.length) onFiles(files);
  }, [onFiles, validate]);

  const handleInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const files = validate(Array.from(e.target.files ?? []));
    if (files.length) onFiles(files);
    e.target.value = '';
  }, [onFiles, validate]);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={`relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-12 transition-colors ${
        dragging ? 'border-blue-500 bg-blue-50' :
        disabled ? 'border-gray-200 bg-gray-50 opacity-60' :
        'border-gray-300 bg-white hover:border-blue-400 hover:bg-blue-50/30'
      }`}
    >
      <Upload className={`h-10 w-10 ${dragging ? 'text-blue-500' : 'text-gray-400'}`} />
      <p className="mt-4 text-center text-sm text-gray-600">{t('upload.drag')}</p>
      <p className="mt-1 text-center text-xs text-gray-400">{t('upload.formats')}</p>

      <label className="mt-4 cursor-pointer rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
        Choisir des fichiers
        <input
          type="file"
          accept=".jpg,.jpeg,.png,.pdf,.heic,.heif"
          multiple
          onChange={handleInput}
          disabled={disabled}
          className="hidden"
        />
      </label>

      {error && (
        <div className="mt-4 flex items-center gap-2 text-sm text-red-600">
          <FileWarning className="h-4 w-4" /> {error}
        </div>
      )}
    </div>
  );
}
