import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { analyticsQuery, toRows, dateRangeFromPreset } from '@/lib/admin/analyticsApi';
import type { Period } from './PeriodFilter';

interface JourneyRow {
  event: string;
  timestamp: string;
  properties: Record<string, unknown> | string | null;
  url: string | null;
}

function fmtTs(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

function parseProps(p: JourneyRow['properties']): Record<string, unknown> {
  if (!p) return {};
  if (typeof p === 'string') {
    try { return JSON.parse(p) as Record<string, unknown>; } catch { return {}; }
  }
  return p;
}

export function UserJourneys({ period }: { period: Period }) {
  const range = dateRangeFromPreset(period);
  const [distinctId, setDistinctId] = useState('');
  const [search, setSearch] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  const q = useQuery({
    queryKey: ['analytics', 'user_journey', search, period],
    queryFn: () => analyticsQuery('user_journey', { ...range, distinct_id: search! }),
    enabled: !!search,
    staleTime: 30_000,
  });

  const rows = q.data ? toRows<JourneyRow>(q.data) : [];

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          value={distinctId}
          onChange={(e) => setDistinctId(e.target.value)}
          placeholder="distinct_id (user.id Supabase) ou email de um utilizador"
          className="max-w-md"
        />
        <Button
          onClick={() => setSearch(distinctId.trim() || null)}
          disabled={distinctId.trim().length < 3}
        >
          Ver timeline
        </Button>
      </div>

      {!search && (
        <div className="text-sm text-muted-foreground">
          Cola o distinct_id (user.id) para ver a timeline de eventos dele.
        </div>
      )}

      {search && q.isLoading && <div className="text-sm text-muted-foreground">A carregar...</div>}
      {search && q.isError && (
        <div className="text-sm text-destructive">{(q.error as Error).message}</div>
      )}

      {search && !q.isLoading && rows.length === 0 && (
        <div className="text-sm text-muted-foreground">Nenhum evento encontrado.</div>
      )}

      {rows.length > 0 && (
        <div className="rounded-lg border divide-y">
          {rows.map((r, i) => {
            const props = parseProps(r.properties);
            const isOpen = expanded === i;
            return (
              <div key={i} className="p-3">
                <button
                  onClick={() => setExpanded(isOpen ? null : i)}
                  className="w-full grid grid-cols-[180px_1fr_auto] gap-3 items-center text-sm text-left"
                >
                  <span className="text-xs text-muted-foreground tabular-nums">{fmtTs(r.timestamp)}</span>
                  <span className="font-mono text-xs">{r.event}</span>
                  <span className="text-xs text-muted-foreground truncate max-w-xs">{r.url ?? ''}</span>
                </button>
                {isOpen && (
                  <pre className="mt-2 overflow-x-auto rounded bg-muted/40 p-2 text-[11px]">
{JSON.stringify(props, null, 2)}
                  </pre>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
