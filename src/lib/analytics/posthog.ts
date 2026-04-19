import posthog from 'posthog-js';

export const POSTHOG_KEY = (import.meta.env.VITE_PUBLIC_POSTHOG_PROJECT_TOKEN as string | undefined)
  ?? (import.meta.env.VITE_POSTHOG_KEY as string | undefined);

export const POSTHOG_HOST = (import.meta.env.VITE_PUBLIC_POSTHOG_HOST as string | undefined)
  ?? (import.meta.env.VITE_POSTHOG_HOST as string | undefined)
  ?? 'https://eu.i.posthog.com';

export const POSTHOG_OPTIONS = {
  api_host: POSTHOG_HOST,
  defaults: '2026-01-30' as const,
};

export function isReady(): boolean {
  const cfg = (posthog as unknown as { config?: { token?: string } }).config;
  return !!cfg?.token;
}

export { posthog };
