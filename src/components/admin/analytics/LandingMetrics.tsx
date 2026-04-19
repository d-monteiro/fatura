import { useQuery } from '@tanstack/react-query';
import { analyticsQuery, toRows, dateRangeFromPreset } from '@/lib/admin/analyticsApi';
import type { Period } from './PeriodFilter';

interface FunnelRow {
  stage: string;
  users: number;
  ord: number;
}

interface SourceRow {
  source: string;
  users: number;
}

const STAGE_LABELS: Record<string, string> = {
  visitors: 'Visitantes (pageviews)',
  onboarding_started: 'Entraram no onboarding',
  signup_completed: 'Criaram conta',
  onboarding_submitted: 'Submeteram onboarding',
};

export function LandingMetrics({ period }: { period: Period }) {
  const range = dateRangeFromPreset(period);

  const funnelQ = useQuery({
    queryKey: ['analytics', 'landing_conversion', period],
    queryFn: () => analyticsQuery('landing_conversion', range),
    staleTime: 60_000,
  });

  const sourcesQ = useQuery({
    queryKey: ['analytics', 'signup_sources', period],
    queryFn: () => analyticsQuery('signup_sources', range),
    staleTime: 60_000,
  });

  const rows = funnelQ.data ? toRows<FunnelRow>(funnelQ.data) : [];
  const firstUsers = rows[0]?.users ?? 0;
  const maxUsers = Math.max(1, ...rows.map((r) => Number(r.users)));
  const sources = sourcesQ.data ? toRows<SourceRow>(sourcesQ.data) : [];

  return (
    <div className="space-y-6">
      <div className="rounded-lg border p-4">
        <div className="text-sm font-semibold mb-3">Funil de conversão — Landing → Onboarding</div>
        {funnelQ.isLoading ? (
          <div className="text-sm text-muted-foreground">A carregar...</div>
        ) : (
          <div className="space-y-2">
            {rows.map((r, i) => {
              const width = (Number(r.users) / maxUsers) * 100;
              const prev = i > 0 ? Number(rows[i - 1].users) : Number(r.users);
              const conv = firstUsers > 0 ? Math.round((Number(r.users) / firstUsers) * 100) : 0;
              const drop = prev > 0 ? Math.round(((prev - Number(r.users)) / prev) * 100) : 0;
              return (
                <div key={r.stage} className="grid grid-cols-[220px_1fr_auto] items-center gap-3">
                  <div className="text-sm font-medium">{STAGE_LABELS[r.stage] ?? r.stage}</div>
                  <div className="relative h-8 rounded-md bg-muted/40 overflow-hidden">
                    <div className="absolute inset-y-0 left-0 bg-accent" style={{ width: `${width}%` }} />
                    <div className="relative flex h-full items-center px-2 text-xs font-medium">
                      {r.users} users
                    </div>
                  </div>
                  <div className="w-24 text-right text-xs">
                    <div className="font-medium">{conv}%</div>
                    {i > 0 && drop > 0 && <div className="text-destructive">−{drop}%</div>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-lg border">
        <div className="flex items-center justify-between p-4 border-b">
          <div className="text-sm font-semibold">Top referrers em signups</div>
        </div>
        {sourcesQ.isLoading ? (
          <div className="p-4 text-sm text-muted-foreground">A carregar...</div>
        ) : sources.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">Ainda sem signups no período.</div>
        ) : (
          <div className="divide-y">
            {sources.map((s) => (
              <div key={s.source} className="flex items-center justify-between p-3 text-sm">
                <span className="font-mono text-xs truncate">{s.source}</span>
                <span className="tabular-nums">{s.users}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
