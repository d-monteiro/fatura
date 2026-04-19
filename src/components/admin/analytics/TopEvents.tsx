import { useQuery } from '@tanstack/react-query';
import { analyticsQuery, toRows, dateRangeFromPreset } from '@/lib/admin/analyticsApi';
import type { Period } from './PeriodFilter';

interface EventRow {
  event: string;
  total: number;
  users: number;
}

export function TopEvents({ period }: { period: Period }) {
  const range = dateRangeFromPreset(period);
  const q = useQuery({
    queryKey: ['analytics', 'top_events', period],
    queryFn: () => analyticsQuery('top_events', range),
    staleTime: 60_000,
  });

  if (q.isError) return <div className="text-sm text-destructive">{(q.error as Error).message}</div>;
  const rows = q.data ? toRows<EventRow>(q.data) : [];
  const max = Math.max(1, ...rows.map((r) => Number(r.total)));

  return (
    <div className="rounded-lg border">
      <div className="grid grid-cols-[1fr_100px_100px_200px] gap-2 px-4 py-2 border-b text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        <div>Evento</div>
        <div className="text-right">Total</div>
        <div className="text-right">Users</div>
        <div></div>
      </div>
      {q.isLoading ? (
        <div className="p-6 text-sm text-muted-foreground">A carregar...</div>
      ) : rows.length === 0 ? (
        <div className="p-6 text-center text-sm text-muted-foreground">Sem eventos no período.</div>
      ) : (
        rows.map((r) => {
          const w = (Number(r.total) / max) * 100;
          return (
            <div key={r.event} className="grid grid-cols-[1fr_100px_100px_200px] items-center gap-2 px-4 py-2 text-sm">
              <div className="font-mono text-xs truncate">{r.event}</div>
              <div className="text-right tabular-nums">{r.total}</div>
              <div className="text-right tabular-nums text-muted-foreground">{r.users}</div>
              <div className="relative h-2 rounded bg-muted/40 overflow-hidden">
                <div className="absolute inset-y-0 left-0 bg-primary/80" style={{ width: `${w}%` }} />
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
