import { useQuery } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { analyticsQuery, toRows, dateRangeFromPreset } from '@/lib/admin/analyticsApi';
import { KpiCard } from './KpiCard';
import type { Period } from './PeriodFilter';

interface KpiRow {
  dau: number;
  mau: number;
  signups_7d: number;
  onboarding_completed_7d: number;
  onboarding_started_7d: number;
}

interface TimelineRow {
  day: string;
  events: number;
  users: number;
}

function fmtDay(d: string): string {
  const dt = new Date(d);
  return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}`;
}

export function AnalyticsOverview({ period }: { period: Period }) {
  const range = dateRangeFromPreset(period);

  const kpis = useQuery({
    queryKey: ['analytics', 'overview_kpis'],
    queryFn: () => analyticsQuery('overview_kpis'),
    staleTime: 60_000,
  });

  const timeline = useQuery({
    queryKey: ['analytics', 'events_timeline', period],
    queryFn: () => analyticsQuery('events_timeline', range),
    staleTime: 60_000,
  });

  const k = kpis.data ? toRows<KpiRow>(kpis.data)[0] : undefined;
  const completionRate = k && k.onboarding_started_7d > 0
    ? Math.round((k.onboarding_completed_7d / k.onboarding_started_7d) * 100)
    : 0;

  const tlData = timeline.data
    ? toRows<TimelineRow>(timeline.data).map((r) => ({
        day: fmtDay(r.day),
        Eventos: Number(r.events ?? 0),
        Utilizadores: Number(r.users ?? 0),
      }))
    : [];

  if (kpis.isError || timeline.isError) {
    const msg = (kpis.error ?? timeline.error) instanceof Error
      ? (kpis.error ?? timeline.error as Error).message
      : 'Erro desconhecido';
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        {msg}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="DAU (hoje)" value={k?.dau ?? 0} loading={kpis.isLoading} />
        <KpiCard label="MAU (30d)" value={k?.mau ?? 0} loading={kpis.isLoading} />
        <KpiCard
          label="Signups (7d)"
          value={k?.signups_7d ?? 0}
          hint={`${k?.onboarding_started_7d ?? 0} iniciaram onboarding`}
          loading={kpis.isLoading}
        />
        <KpiCard
          label="Onboarding completo (7d)"
          value={`${completionRate}%`}
          hint={`${k?.onboarding_completed_7d ?? 0} / ${k?.onboarding_started_7d ?? 0}`}
          loading={kpis.isLoading}
        />
      </div>

      <div className="rounded-lg border p-4">
        <div className="text-sm font-semibold mb-2">Atividade — {period}</div>
        <div className="h-64">
          {timeline.isLoading ? (
            <div className="text-sm text-muted-foreground">A carregar...</div>
          ) : tlData.length === 0 ? (
            <div className="text-sm text-muted-foreground">Sem dados no período.</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={tlData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip />
                <Line type="monotone" dataKey="Eventos" stroke="#0e2435" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Utilizadores" stroke="#bbb388" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
