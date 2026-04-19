// HogQL templates invocados a partir do admin. Parametros vêm sanitizados
// (datas ISO, distinct_id UUID) — nunca SQL arbitrário.
// Refs: https://posthog.com/docs/hogql/expressions

export type QueryId =
  | 'overview_kpis'
  | 'events_timeline'
  | 'onboarding_funnel'
  | 'onboarding_abandoned'
  | 'top_events'
  | 'event_breakdown'
  | 'user_journey'
  | 'landing_conversion'
  | 'signup_sources';

export interface QueryParams {
  from?: string;
  to?: string;
  distinct_id?: string;
  event?: string;
  property?: string;
}

function iso(d?: string): string {
  if (d && /^\d{4}-\d{2}-\d{2}/.test(d)) return d;
  const now = new Date();
  now.setDate(now.getDate() - 30);
  return now.toISOString();
}

function isoEnd(d?: string): string {
  if (d && /^\d{4}-\d{2}-\d{2}/.test(d)) return d;
  return new Date().toISOString();
}

function safeIdent(v?: string): string {
  if (!v) return '';
  return v.replace(/[^a-zA-Z0-9_\-.:@$]/g, '');
}

export function buildHogQL(id: QueryId, params: QueryParams): string {
  const from = `toDateTime('${iso(params.from)}')`;
  const to = `toDateTime('${isoEnd(params.to)}')`;

  switch (id) {
    case 'overview_kpis':
      return `
        SELECT
          uniqIf(person_id, dateDiff('day', timestamp, now()) <= 1) AS dau,
          uniq(person_id) AS mau,
          countIf(event = 'signup_completed' AND dateDiff('day', timestamp, now()) <= 7) AS signups_7d,
          countIf(event = 'onboarding_submitted' AND dateDiff('day', timestamp, now()) <= 7) AS onboarding_completed_7d,
          countIf(event = 'onboarding_started' AND dateDiff('day', timestamp, now()) <= 7) AS onboarding_started_7d
        FROM events
        WHERE dateDiff('day', timestamp, now()) <= 30
      `;

    case 'events_timeline':
      return `
        SELECT
          toDate(timestamp) AS day,
          count() AS events,
          uniq(person_id) AS users
        FROM events
        WHERE timestamp >= ${from} AND timestamp <= ${to}
        GROUP BY day
        ORDER BY day ASC
      `;

    case 'onboarding_funnel':
      return `
        SELECT
          toInt(properties.step) AS step,
          any(properties.step_name) AS step_name,
          uniq(person_id) AS users,
          avg(toFloat(properties.time_spent_ms)) AS avg_time_ms
        FROM events
        WHERE event IN ('onboarding_step_viewed', 'onboarding_step_completed')
          AND timestamp >= ${from} AND timestamp <= ${to}
          AND properties.step IS NOT NULL
        GROUP BY step
        ORDER BY step ASC
      `;

    case 'onboarding_abandoned':
      return `
        SELECT
          person_id,
          any(person.properties.email) AS email,
          max(toInt(properties.step)) AS last_step,
          max(timestamp) AS last_seen
        FROM events
        WHERE event = 'onboarding_step_abandoned'
          AND timestamp >= ${from} AND timestamp <= ${to}
          AND person_id NOT IN (
            SELECT DISTINCT person_id FROM events
            WHERE event = 'onboarding_submitted'
              AND timestamp >= ${from} AND timestamp <= ${to}
          )
        GROUP BY person_id
        ORDER BY last_seen DESC
        LIMIT 100
      `;

    case 'top_events':
      return `
        SELECT
          event,
          count() AS total,
          uniq(person_id) AS users
        FROM events
        WHERE timestamp >= ${from} AND timestamp <= ${to}
          AND event NOT LIKE '$%'
        GROUP BY event
        ORDER BY total DESC
        LIMIT 50
      `;

    case 'event_breakdown': {
      const ev = safeIdent(params.event);
      const prop = safeIdent(params.property);
      if (!ev || !prop) throw new Error('event_breakdown requer event + property');
      return `
        SELECT
          toString(properties.${prop}) AS value,
          count() AS total,
          uniq(person_id) AS users
        FROM events
        WHERE event = '${ev}'
          AND timestamp >= ${from} AND timestamp <= ${to}
        GROUP BY value
        ORDER BY total DESC
        LIMIT 30
      `;
    }

    case 'user_journey': {
      const did = safeIdent(params.distinct_id);
      if (!did) throw new Error('user_journey requer distinct_id');
      return `
        SELECT
          event,
          timestamp,
          properties.$current_url AS url,
          properties.$pathname AS pathname
        FROM events
        WHERE distinct_id = '${did}'
          AND timestamp >= ${from}
        ORDER BY timestamp DESC
        LIMIT 200
      `;
    }

    case 'landing_conversion':
      return `
        SELECT
          'visitors' AS stage,
          uniq(person_id) AS users,
          1 AS ord
        FROM events
        WHERE event = '$pageview'
          AND timestamp >= ${from} AND timestamp <= ${to}
        UNION ALL
        SELECT
          'onboarding_started' AS stage,
          uniq(person_id) AS users,
          2 AS ord
        FROM events
        WHERE event = 'onboarding_started'
          AND timestamp >= ${from} AND timestamp <= ${to}
        UNION ALL
        SELECT
          'signup_completed' AS stage,
          uniq(person_id) AS users,
          3 AS ord
        FROM events
        WHERE event = 'signup_completed'
          AND timestamp >= ${from} AND timestamp <= ${to}
        UNION ALL
        SELECT
          'onboarding_submitted' AS stage,
          uniq(person_id) AS users,
          4 AS ord
        FROM events
        WHERE event = 'onboarding_submitted'
          AND timestamp >= ${from} AND timestamp <= ${to}
        ORDER BY ord ASC
      `;

    case 'signup_sources':
      return `
        SELECT
          coalesce(toString(properties.$referring_domain), '(direct)') AS source,
          uniq(person_id) AS users
        FROM events
        WHERE event = 'signup_completed'
          AND timestamp >= ${from} AND timestamp <= ${to}
        GROUP BY source
        ORDER BY users DESC
        LIMIT 20
      `;

    default:
      throw new Error(`query_id desconhecido: ${id}`);
  }
}

export const VALID_QUERY_IDS: QueryId[] = [
  'overview_kpis',
  'events_timeline',
  'onboarding_funnel',
  'onboarding_abandoned',
  'top_events',
  'event_breakdown',
  'user_journey',
  'landing_conversion',
  'signup_sources',
];
