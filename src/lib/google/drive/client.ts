import { reportError } from '@/lib/errors/errorReporter';

export const DRIVE_TIMEOUT_MS = 30_000;
export const DRIVE_UPLOAD_TIMEOUT_MS = 120_000;

export function createTimeoutSignal(ms: number): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timeoutId) };
}

export async function getTokenInfo(accessToken: string): Promise<{ scopes: string[]; email?: string } | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(
      `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${accessToken}`,
      { signal: controller.signal },
    );
    if (!response.ok) {
      void reportError(`tokeninfo respondeu ${response.status}`, {
        component: 'google/getTokenInfo',
        level: 'warn',
        extra: { status: response.status },
      });
      return null;
    }
    const data = await response.json();
    return { scopes: data.scope?.split(' ') ?? [], email: data.email };
  } catch (err) {
    void reportError(err, { component: 'google/getTokenInfo', level: 'warn' });
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}
