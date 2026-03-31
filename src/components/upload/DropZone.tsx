import { useCallback, useRef, useState, type DragEvent } from 'react';
import { Upload, FileWarning, Camera, FolderOpen } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { useIsMobile } from '@/hooks/useIsMobile';
import { CameraWarningModal } from './CameraWarningModal';

const ACCEPTED = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf', 'image/heic', 'image/heif'];
const MAX_SIZE = 10 * 1024 * 1024;

interface DropZoneProps {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  hasFiles?: boolean;
}

export function DropZone({ onFiles, disabled, hasFiles }: DropZoneProps) {
  const { t } = useI18n();
  const isMobile = useIsMobile();
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCameraWarning, setShowCameraWarning] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const validate = useCallback((files: File[]): File[] => {
    const valid: File[] = [];
    for (const f of files) {
      if (f.size > MAX_SIZE) { setError(t('error.file_too_large')); continue; }
      if (!ACCEPTED.includes(f.type)) { setError(t('error.invalid_format')); continue; }
      valid.push(f);
    }
    return valid;
  }, [t]);

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault(); setDragging(false); setError(null);
    const files = validate(Array.from(e.dataTransfer.files));
    if (files.length) onFiles(files);
  }, [onFiles, validate]);

  const handleInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const files = validate(Array.from(e.target.files ?? []));
    if (files.length) onFiles(files);
    e.target.value = '';
  }, [onFiles, validate]);

  const confirmCamera = () => { setShowCameraWarning(false); cameraRef.current?.click(); };

  return (
    <>
      {showCameraWarning && (
        <CameraWarningModal onConfirm={confirmCamera} onCancel={() => setShowCameraWarning(false)} />
      )}

      {/* Hidden inputs for mobile camera */}
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleInput} />
      <input ref={fileRef} type="file" accept=".jpg,.jpeg,.png,.pdf,.heic,.heif" multiple className="hidden" onChange={handleInput} />

      {/* Mobile buttons */}
      {isMobile && !hasFiles && (
        <div className="space-y-3 mb-4">
          <button
            className="flex w-full items-center justify-center gap-3 rounded-xl bg-primary px-4 py-4 text-base font-medium text-white shadow-md hover:opacity-90 disabled:opacity-50 transition-all"
            onClick={() => setShowCameraWarning(true)} disabled={disabled}
          >
            <Camera className="h-5 w-5" />{t('upload.take_photo')}
          </button>
          <button
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-gray-300 bg-white px-4 py-4 text-base font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            onClick={() => fileRef.current?.click()} disabled={disabled}
          >
            <FolderOpen className="h-5 w-5" />{t('upload.choose_file')}
          </button>
        </div>
      )}

      {/* Drag & drop zone (hidden on mobile when no files) */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 sm:p-12 transition-colors ${
          isMobile && !hasFiles ? 'hidden' : ''
        } ${dragging ? 'border-blue-500 bg-blue-50' :
          disabled ? 'border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed' :
          'border-gray-300 bg-white hover:border-blue-400 hover:bg-blue-50/30 cursor-pointer'
        }`}
      >
        <Upload className={`h-10 w-10 ${dragging ? 'text-blue-500' : 'text-gray-400'}`} />
        <p className="mt-4 text-center text-sm text-gray-600">
          {dragging ? t('upload.drop_here') : t('upload.drag')}
        </p>
        <p className="mt-1 text-center text-xs text-gray-400">{t('upload.formats')}</p>
        <label className="mt-4 cursor-pointer rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white shadow-sm hover:opacity-90 transition-all">
          {t('upload.choose_file')}
          <input type="file" accept=".jpg,.jpeg,.png,.pdf,.heic,.heif" multiple onChange={handleInput} disabled={disabled} className="hidden" />
        </label>
        {error && (
          <div className="mt-4 flex items-center gap-2 text-sm text-red-600">
            <FileWarning className="h-4 w-4" /> {error}
          </div>
        )}
      </div>
    </>
  );
}
