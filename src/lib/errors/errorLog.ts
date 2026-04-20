import { supabase } from '@/lib/supabase/client';
import type { ErrorContext } from './errorTypes';

const TENANT_STORAGE_KEY = 'faturai-current-tenant';
const DEDUP_WINDOW_MS = 10_000;
const recentKeys = new Map<string, number>();

function dedupKey(message: string, component?: string): string {
  return `${component ?? ''}::${message}`;
}

function isDuplicate(key: string): boolean {
  const now = Date.now();
  for (const [k, ts] of recentKeys) {
    if (now - ts > DEDUP_WINDOW_MS) recentKeys.delete(k);
  }
  const last = recentKeys.get(key);
  recentKeys.set(key, now);
  return last !== undefined && now - last < DEDUP_WINDOW_MS;
}

async function getCurrentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

function getCurrentTenantId(): string | null {
  try { return localStorage.getItem(TENANT_STORAGE_KEY); } catch { return null; }
}

export interface NormalizedError {
  error: Error;
  level: NonNullable<ErrorContext['level']>;
  component: string | undefined;
  skipSlack: boolean;
  dropped: boolean;
}

// "Load failed" (Safari/WebKit), "Failed to fetch" (Chrome), "NetworkError" (Firefox) são
// falhas de rede do cliente (offline, tab em background, DNS, TLS), não bugs da app.
// Não vale a pena alertar Slack nem marcar como error — baixa para warn.
const NETWORK_ERROR_PATTERN = /^(load failed|failed to fetch|networkerror)/i;

export async function logErrorCore(rawError: unknown, context?: ErrorContext): Promise<NormalizedError> {
  const error = rawError instanceof Error
    ? rawError
    : new Error(typeof rawError === 'string' ? rawError : JSON.stringify(rawError));
  const isNetworkError = NETWORK_ERROR_PATTERN.test(error.message.trim());
  const level = context?.level ?? (isNetworkError ? 'warn' : 'error');
  const component = context?.component ?? context?.function;
  const skipSlack = context?.skipSlack ?? isNetworkError;

  const key = dedupKey(error.message, component);
  if (isDuplicate(key)) {
    return { error, level, component, skipSlack, dropped: true };
  }

  console.error('[FaturaAI Error]', error.message, context, error.stack);

  const userId = context?.userId ?? (await getCurrentUserId().catch(() => null));
  const tenantId = context?.tenantId ?? getCurrentTenantId();

  const { error: insertError } = await supabase.from('error_logs').insert({
    tenant_id: tenantId,
    user_id: userId,
    level,
    source: 'frontend',
    function_name: component ?? null,
    message: error.message.slice(0, 2000),
    stack_trace: error.stack?.slice(0, 8000) ?? null,
    metadata: {
      path: window.location.pathname,
      user_agent: navigator.userAgent,
      ...context?.extra,
    },
  });

  if (insertError) {
    console.error('[FaturaAI Error] falha a gravar em error_logs:', insertError.message, insertError.code);
  }

  return { error, level, component, skipSlack, dropped: false };
}
