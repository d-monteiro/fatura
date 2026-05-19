import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plug, LifeBuoy, FileSpreadsheet, Sparkles, Clock, Download, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

const DISMISS_KEY_PREFIX = 'flowzi.dashboard.externalIntegrationsDismissed.';

function dismissKey(userId: string | null | undefined) {
  return userId ? `${DISMISS_KEY_PREFIX}${userId}` : null;
}

export function ExternalIntegrationsCard() {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState<boolean>(() => {
    const key = dismissKey(user?.id);
    if (!key) return false;
    try {
      return window.localStorage.getItem(key) === '1';
    } catch {
      return false;
    }
  });

  if (dismissed) return null;

  const handleDismiss = () => {
    const key = dismissKey(user?.id);
    if (key) {
      try { window.localStorage.setItem(key, '1'); } catch { /* ignore quota/SSR */ }
    }
    setDismissed(true);
  };

  return (
    <div className="relative rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-white p-5 shadow-card sm:p-6">
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dispensar"
        className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full text-indigo-500/70 hover:bg-indigo-100 hover:text-indigo-700"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:gap-8">
        <div className="flex flex-1 items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
            <Plug className="h-6 w-6" />
          </div>

          <div className="flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold text-gray-900">
                Integração com sistemas de faturação
              </h3>
              <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-700">
                Em breve
              </span>
            </div>

            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-start gap-2.5">
                <Sparkles className="h-4 w-4 shrink-0 text-indigo-500 mt-0.5" />
                <span>Ligação directa ao <strong className="font-medium text-gray-800">Moloni</strong>, <strong className="font-medium text-gray-800">InvoiceXpress</strong> e outros gestores.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <Clock className="h-4 w-4 shrink-0 text-indigo-500 mt-0.5" />
                <span>Precisas já? Abre um ticket de apoio e priorizamos.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <Download className="h-4 w-4 shrink-0 text-indigo-500 mt-0.5" />
                <span>Entretanto, exporta as tuas faturas e importa-as onde trabalhas.</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:w-40">
          <Link
            to="/tickets"
            className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            <LifeBuoy className="h-4 w-4" />
            Abrir ticket
          </Link>
          <Link
            to="/invoices"
            className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Exportar
          </Link>
        </div>
      </div>
    </div>
  );
}
