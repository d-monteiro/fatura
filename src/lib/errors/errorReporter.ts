/**
 * FaturaAI - Error Reporter
 * Logs errors to console (dev) and Supabase error_logs table.
 */

import { supabase } from '@/lib/supabase/client';
import { notifySlack } from '@/lib/slack/notify';
import type { ErrorContext } from './errorTypes';

export async function reportError(error: Error, context?: ErrorContext): Promise<void> {
  const level = context?.level ?? 'error';

  // 1. Always log to console
  console.error('[FaturaAI Error]', error.message, context);

  // 2. Log to Supabase error_logs
  try {
    await supabase.from('error_logs').insert({
      tenant_id: context?.tenantId ?? null,
      user_id: context?.userId ?? null,
      level,
      source: 'frontend',
      function_name: context?.component ?? context?.function ?? null,
      message: error.message,
      stack_trace: error.stack ?? null,
      metadata: {
        url: window.location.href,
        userAgent: navigator.userAgent,
        ...context?.extra,
      },
    });
  } catch {
    // Silently fail — don't error on error reporting
  }

  // 3. Notify Slack for critical errors only
  if (level === 'error' || level === 'fatal') {
    void notifySlack({
      channel: 'alerts',
      payload: {
        level,
        source: 'frontend',
        function_name: context?.component ?? context?.function,
        message: error.message,
      },
    });
  }
}

/**
 * Report a warning (non-fatal issue).
 */
export async function reportWarning(message: string, context?: ErrorContext): Promise<void> {
  await reportError(new Error(message), { ...context, level: 'warn' });
}
