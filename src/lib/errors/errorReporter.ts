import { notifySlack } from '@/lib/slack/notify';
import { logErrorCore } from './errorLog';
import type { ErrorContext } from './errorTypes';

export async function reportError(error: unknown, context?: ErrorContext): Promise<void> {
  const result = await logErrorCore(error, context);
  if (result.dropped) return;

  if (!result.skipSlack && (result.level === 'error' || result.level === 'fatal')) {
    void notifySlack({
      channel: 'alerts',
      payload: {
        level: result.level,
        source: 'frontend',
        function_name: result.component,
        message: result.error.message,
      },
    });
  }
}

let globalHandlersInstalled = false;

export function installGlobalErrorHandlers(): void {
  if (globalHandlersInstalled || typeof window === 'undefined') return;
  // HMR em dev re-cria React contexts e dispara "useX must be used within Provider"
  // transitoriamente. Evita poluir error_logs de produção com ruído de dev.
  if (import.meta.env.DEV) return;
  globalHandlersInstalled = true;

  window.addEventListener('error', (event) => {
    const err = event.error instanceof Error ? event.error : new Error(event.message || 'window.error');
    void reportError(err, {
      level: 'error',
      component: 'window.onerror',
      extra: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      },
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const err = reason instanceof Error ? reason : new Error(
      typeof reason === 'string' ? reason : `Unhandled rejection: ${JSON.stringify(reason)?.slice(0, 500)}`,
    );
    void reportError(err, {
      level: 'error',
      component: 'unhandledrejection',
    });
  });
}
