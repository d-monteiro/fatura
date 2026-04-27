import {
  createContext, useContext, useState, useCallback, useRef, useEffect,
  type ReactNode,
} from 'react';
import type { UploadFileState } from '@/components/upload/UploadResultList';
import { processInvoiceUpload } from '@/lib/invoiceProcessor';
import { track } from '@/lib/analytics/track';
import { EVENTS } from '@/lib/analytics/events';
import { useI18n } from '@/contexts/I18nContext';

const MAX_FILES = 10;
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW = 60_000;
const uploadTimestamps: number[] = [];

function checkRateLimit(): { allowed: boolean; waitSeconds: number } {
  const now = Date.now();
  while (uploadTimestamps.length > 0 && uploadTimestamps[0] < now - RATE_LIMIT_WINDOW) uploadTimestamps.shift();
  if (uploadTimestamps.length >= RATE_LIMIT_MAX) {
    return { allowed: false, waitSeconds: Math.ceil((uploadTimestamps[0] + RATE_LIMIT_WINDOW - now) / 1000) };
  }
  return { allowed: true, waitSeconds: 0 };
}

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }

export interface UploadDeps {
  userId: string | null;
  accessToken: string | null;
  companyId: string | null;
  tenantId?: string | null;
}

interface UploadQueueValue {
  files: UploadFileState[];
  isProcessing: boolean;
  currentIndex: number;
  rateLimitError: string | null;
  completedCount: number;
  errorCount: number;
  totalCount: number;
  progress: number;
  handleFiles: (newFiles: File[], deps: UploadDeps) => void;
  resetUpload: () => void;
  dismissRateLimit: () => void;
}

const UploadQueueContext = createContext<UploadQueueValue | null>(null);

export function UploadQueueProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [files, setFiles] = useState<UploadFileState[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [rateLimitError, setRateLimitError] = useState<string | null>(null);
  const abortRef = useRef(false);
  const processingRef = useRef(false);
  const filesRef = useRef<UploadFileState[]>([]);
  // Deps capturadas no início do batch — não muda a meio mesmo que o user
  // mude de empresa/tenant na UI enquanto o processamento corre.
  const depsRef = useRef<UploadDeps | null>(null);

  useEffect(() => { filesRef.current = files; }, [files]);

  useEffect(() => {
    if (!isProcessing || processingRef.current) return;
    if (!depsRef.current) return;
    processingRef.current = true;
    const snapshot = filesRef.current;
    const deps = depsRef.current;

    (async () => {
      for (let i = 0; i < snapshot.length; i++) {
        if (abortRef.current) break;
        const f = snapshot[i];
        if (!f.file) continue;
        setCurrentIndex(i);

        setFiles(prev => prev.map((x, idx) =>
          idx === i ? { ...x, status: 'uploading', progress: 20, message: t('upload.uploading') } : x));
        await delay(200);
        setFiles(prev => prev.map((x, idx) =>
          idx === i ? { ...x, status: 'analyzing', progress: 50, message: t('upload.analyzing_ai') } : x));

        try {
          const results = await processInvoiceUpload(
            f.file, deps.userId, deps.accessToken, deps.companyId, deps.tenantId,
          );
          uploadTimestamps.push(Date.now());

          if (results.length === 1) {
            const r = results[0];
            setFiles(prev => prev.map((x, idx) => {
              if (idx !== i) return x;
              if (r.isDuplicate) return { ...x, status: 'duplicate', progress: 100, error: r.error, message: r.error };
              if (r.success && r.invoice) return {
                ...x, status: 'success', progress: 100, message: t('upload.processed_msg'),
                supplierName: r.invoice.supplier_name ?? undefined, valorTotal: r.invoice.valor_total ?? undefined,
              };
              return { ...x, status: 'error', progress: 100, error: r.error, message: r.error };
            }));
          } else {
            setFiles(prev => prev.map((x, idx) =>
              idx === i ? { ...x, status: 'success', progress: 100, supplierName: `${results.length} faturas` } : x));
            for (let j = 0; j < results.length; j++) {
              const r = results[j];
              setFiles(prev => [...prev, {
                id: `${f.id}-sub-${j}`, fileName: r.invoice?.supplier_name ?? f.fileName, progress: 80,
                status: r.isDuplicate ? 'duplicate' : r.success ? 'success' : 'error',
                error: r.error, supplierName: r.invoice?.supplier_name ?? undefined,
                valorTotal: r.invoice?.valor_total ?? undefined,
              }]);
            }
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Erro';
          setFiles(prev => prev.map((x, idx) =>
            idx === i ? { ...x, status: 'error', progress: 100, error: msg, message: msg } : x));
        }
        await delay(300);
      }
      const final = filesRef.current;
      track(EVENTS.INVOICE_UPLOAD_COMPLETED, {
        total: final.length,
        success: final.filter(f => f.status === 'success').length,
        errors: final.filter(f => f.status === 'error').length,
        duplicates: final.filter(f => f.status === 'duplicate').length,
      });
      setIsProcessing(false);
      processingRef.current = false;
    })();
  }, [isProcessing, t]);

  const handleFiles = useCallback((newFiles: File[], deps: UploadDeps) => {
    const rate = checkRateLimit();
    if (!rate.allowed) {
      setRateLimitError(t('upload.rate_limit_desc').replace('{seconds}', String(rate.waitSeconds)));
      return;
    }
    setRateLimitError(null);
    const batch = newFiles.slice(0, MAX_FILES);
    track(EVENTS.INVOICE_UPLOAD_STARTED, {
      source: 'dropzone',
      count: batch.length,
      total_size: batch.reduce((s, f) => s + f.size, 0),
    });
    setFiles(batch.map((file, i) => ({
      id: `${Date.now()}-${i}-${file.name}`, fileName: file.name,
      status: 'pending' as const, progress: 0, file,
    })));
    abortRef.current = false;
    depsRef.current = deps;
    setIsProcessing(true);
  }, [t]);

  const resetUpload = useCallback(() => {
    abortRef.current = true;
    setIsProcessing(false);
    processingRef.current = false;
    setFiles([]);
    setCurrentIndex(0);
    setRateLimitError(null);
    depsRef.current = null;
  }, []);

  const completedCount = files.filter(f => f.status === 'success').length;
  const errCount = files.filter(f => f.status === 'error' || f.status === 'duplicate').length;
  const total = files.length;
  const prog = total > 0 ? Math.round(((completedCount + errCount) / total) * 100) : 0;

  return (
    <UploadQueueContext.Provider value={{
      files, isProcessing, currentIndex, rateLimitError,
      completedCount, errorCount: errCount, totalCount: total, progress: prog,
      handleFiles, resetUpload,
      dismissRateLimit: () => setRateLimitError(null),
    }}>
      {children}
    </UploadQueueContext.Provider>
  );
}

export function useUploadQueue() {
  const ctx = useContext(UploadQueueContext);
  if (!ctx) throw new Error('useUploadQueue must be used within UploadQueueProvider');
  return ctx;
}
