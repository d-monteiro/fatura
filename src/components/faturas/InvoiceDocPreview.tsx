import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import type { Invoice } from '@/types/database';

interface Props {
  invoice: Invoice;
}

function stripQuery(url: string) {
  const i = url.indexOf('?');
  return i === -1 ? url : url.slice(0, i);
}

// Iframes do Drive devolvem 200 mesmo quando o ficheiro foi apagado/movido
// (mostram página interna de erro), por isso onError nem sempre dispara.
// Damos ao utilizador um fallback manual para o Supabase quando o preview
// falha visualmente.
export function InvoiceDocPreview({ invoice }: Props) {
  const { t } = useI18n();
  const [forceFallback, setForceFallback] = useState(false);
  // Reset do fallback ao trocar de invoice (storing info from prev props).
  const [prevId, setPrevId] = useState(invoice.id);
  if (prevId !== invoice.id) {
    setPrevId(invoice.id);
    setForceFallback(false);
  }

  const hasDrive = !!invoice.drive_file_id;
  const hasSupabase = !!invoice.file_url;
  const useDrive = hasDrive && !forceFallback;

  const base = stripQuery(invoice.file_url || '');
  const pathOrUrl = invoice.storage_path || base;
  const isImage = /\.(jpe?g|png)$/i.test(pathOrUrl);

  const switchToSupabase = () => setForceFallback(true);

  if (useDrive) {
    if (isImage) {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center p-4 overflow-auto">
          <img
            src={`https://drive.google.com/thumbnail?id=${invoice.drive_file_id}&sz=w1000`}
            alt="Document"
            className="max-w-full max-h-full object-contain rounded"
            onError={hasSupabase ? switchToSupabase : undefined}
          />
          {hasSupabase && <FallbackHint onFallback={switchToSupabase} />}
        </div>
      );
    }
    return (
      <div className="w-full h-full flex flex-col p-2">
        <iframe
          src={`https://drive.google.com/file/d/${invoice.drive_file_id}/preview`}
          className="flex-1 w-full border-0 rounded-lg"
          title="Document Preview"
          allow="autoplay"
          loading="lazy"
        />
        {hasSupabase && <FallbackHint onFallback={switchToSupabase} />}
      </div>
    );
  }

  if (hasSupabase) {
    if (isImage) {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center p-4 overflow-auto">
          <img src={invoice.file_url ?? undefined} alt="Document" className="max-w-full max-h-full object-contain rounded" />
        </div>
      );
    }
    return (
      <div className="w-full h-full flex flex-col p-2">
        <iframe
          src={invoice.file_url ?? undefined}
          className="flex-1 w-full border-0 rounded-lg"
          title="Document Preview"
          loading="lazy"
        />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center h-full text-gray-400">
      <p>{t('drawer.doc_not_available')}</p>
    </div>
  );
}

function FallbackHint({ onFallback }: { onFallback: () => void }) {
  return (
    <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-xs text-gray-500">
      <span>O documento não carrega?</span>
      <button
        type="button"
        onClick={onFallback}
        className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
      >
        <ExternalLink className="h-3 w-3" /> Ver original (Supabase)
      </button>
    </div>
  );
}

