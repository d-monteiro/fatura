import { supabase } from '@/lib/supabase/client';

export type AnalyticsQueryId =
  | 'overview_kpis'
  | 'events_timeline'
  | 'onboarding_funnel'
  | 'onboarding_abandoned'
  | 'top_events'
  | 'event_breakdown'
  | 'user_journey'
  | 'landing_conversion'
  | 'signup_sources';

export interface AnalyticsParams {
  from?: string;
  to?: string;
  distinct_id?: string;
  event?: string;
  property?: string;
}

export interface AnalyticsResult {
  query_id: AnalyticsQueryId;
  columns: string[];
  results: unknown[][];
  types: unknown;
  cached: boolean;
}

export async function analyticsQuery(
  queryId: AnalyticsQueryId,
  params: AnalyticsParams = {},
): Promise<AnalyticsResult> {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!url) throw new Error('VITE_SUPABASE_URL em falta');

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Sessão em falta');

  const resp = await fetch(`${url}/functions/v1/analytics-query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ query_id: queryId, params }),
  });

  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    throw new Error(`analytics-query ${resp.status}: ${detail.slice(0, 200)}`);
  }

  return resp.json();
}

export function toRows<T>(result: AnalyticsResult): T[] {
  const { columns, results } = result;
  return results.map((row) => {
    const obj: Record<string, unknown> = {};
    columns.forEach((c, i) => { obj[c] = (row as unknown[])[i]; });
    return obj as T;
  });
}

export function dateRangeFromPreset(
  preset: '24h' | '7d' | '30d' | '90d',
): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  switch (preset) {
    case '24h': from.setHours(from.getHours() - 24); break;
    case '7d': from.setDate(from.getDate() - 7); break;
    case '30d': from.setDate(from.getDate() - 30); break;
    case '90d': from.setDate(from.getDate() - 90); break;
  }
  return { from: from.toISOString(), to: to.toISOString() };
}
