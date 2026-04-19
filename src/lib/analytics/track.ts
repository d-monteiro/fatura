import { posthog, isReady } from './posthog';
import type { EventName } from './events';

type Props = Record<string, unknown>;

export function track(event: EventName, properties?: Props) {
  if (!isReady()) return;
  try {
    posthog.capture(event, properties);
  } catch (e) {
    if (import.meta.env.DEV) console.warn('[track]', event, e);
  }
}

export function identify(userId: string, properties?: Props) {
  if (!isReady()) return;
  try {
    posthog.identify(userId, properties);
  } catch (e) {
    if (import.meta.env.DEV) console.warn('[identify]', userId, e);
  }
}

export function identifyTenant(tenantId: string, properties?: Props) {
  if (!isReady()) return;
  try {
    posthog.group('tenant', tenantId, properties ?? {});
  } catch (e) {
    if (import.meta.env.DEV) console.warn('[identifyTenant]', tenantId, e);
  }
}

export function resetTracking() {
  if (!isReady()) return;
  try {
    posthog.reset();
  } catch { /* ignore */ }
}
