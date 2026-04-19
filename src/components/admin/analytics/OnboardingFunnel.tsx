import { useQuery } from '@tanstack/react-query';
import { analyticsQuery, toRows, dateRangeFromPreset } from '@/lib/admin/analyticsApi';
import type { Period } from './PeriodFilter';

const STEP_LABELS: Record<number, string> = {
  1: '1. Empresa',
  2: '2. Faturas',
  3: '3. Armazenamento',
  4: '4. Dashboard',
  5: '5. Automação',
  6: '6. Revisão',
  7: '7. Plano',
};

interface StepRow {
  step: number;
  step_name: string;
  users: number;
  avg_time_ms: number | null;
}

interface AbandonedRow {
  person_id: string;
  email: string | null;
  last_step: number;
  last_seen: string;
}

function fmtMs(ms: number | null): string {
  if (!ms || ms <= 0) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function OnboardingFunnel({ period }: { period: Period }) {
  const range = dateRangeFromPreset(period);

  const funnelQ = useQuery({
    queryKey: ['analytics', 'onboarding_funnel', period],
    queryFn: () => analyticsQuery('onboarding_funnel', range),
    staleTime: 60_000,
  });

  const abandonedQ = useQuery({
    queryKey: ['analytics', 'onboarding_abandoned', period],
    queryFn: () => analyticsQuery('onboarding_abandoned', range),
    staleTime: 60_000,
  });

  if (funnelQ.isError) {
    return <div className="text-sm text-destructive">{(funnelQ.error as Error).message}</div>;
  }

  const rows = funnelQ.data ? toRows<StepRow>(funnelQ.data) : [];
  const byStep = new Map<number, StepRow>();
  rows.forEach((r) => byStep.set(Number(r.step), r));

  const steps: StepRow[] = [1, 2, 3, 4, 5, 6, 7].map((s) => byStep.get(s) ?? {
    step: s, step_name: STEP_LABELS[s] ?? `step_${s}`, users: 0, avg_time_ms: null,
  });
  const firstUsers = steps[0]?.users ?? 0;
  const maxUsers = Math.max(1, ...steps.map((s) => s.users));

  const abandoned = abandonedQ.data ? toRows<AbandonedRow>(abandonedQ.data) : [];

  return (
    <div className="space-y-6">
      <div className="rounded-lg border p-4">
        <div className="text-sm font-semibold mb-3">Funil — utilizadores únicos por step</div>
        {funnelQ.isLoading ? (
          <div className="text-sm text-muted-foreground">A carregar...</div>
        ) : (
          <div className="space-y-2">
            {steps.map((s, i) => {
              const width = (s.users / maxUsers) * 100;
              const prev = i > 0 ? steps[i - 1].users : s.users;
              const drop = prev > 0 ? Math.round(((prev - s.users) / prev) * 100) : 0;
              const conv = firstUsers > 0 ? Math.round((s.users / firstUsers) * 100) : 0;
              return (
                <div key={s.step} className="grid grid-cols-[180px_1fr_auto] items-center gap-3">
                  <div className="text-sm font-medium">{STEP_LABELS[s.step]}</div>
                  <div className="relative h-8 rounded-md bg-muted/40 overflow-hidden">
                    <div
                      className="absolute inset-y-0 left-0 bg-primary/90 transition-all"
                      style={{ width: `${width}%` }}
                    />
                    <div className="relative flex h-full items-center justify-between px-2 text-xs font-medium">
                      <span className={width > 20 ? 'text-primary-foreground' : 'text-primary'}>
                        {s.users} users
                      </span>
                      <span className="text-muted-foreground">
                        {fmtMs(s.avg_time_ms)}
                      </span>
                    </div>
                  </div>
                  <div className="w-24 text-right text-xs">
                    <div className="font-medium">{conv}%</div>
                    {i > 0 && drop > 0 && (
                      <div className="text-destructive">−{drop}%</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-lg border">
        <div className="flex items-center justify-between p-4 border-b">
          <div className="text-sm font-semibold">Abandonados ({abandoned.length})</div>
          <div className="text-xs text-muted-foreground">
            Disparam `onboarding_step_abandoned` sem completar
          </div>
        </div>
        {abandonedQ.isLoading ? (
          <div className="p-4 text-sm text-muted-foreground">A carregar...</div>
        ) : abandoned.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">Nenhum abandono no período.</div>
        ) : (
          <div className="divide-y">
            {abandoned.slice(0, 50).map((a) => (
              <div key={a.person_id} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 p-3 text-sm">
                <div className="truncate font-mono text-xs">{a.email ?? a.person_id}</div>
                <div className="text-xs">Passo {a.last_step ?? '?'}</div>
                <div className="text-xs text-muted-foreground">{fmtDate(a.last_seen)}</div>
                {a.email ? (
                  <a href={`mailto:${a.email}`} className="text-xs text-primary hover:underline">Email</a>
                ) : <span />}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
