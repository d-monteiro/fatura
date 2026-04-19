import { Button } from '@/components/ui/button';

export type Period = '24h' | '7d' | '30d' | '90d';

const LABELS: Record<Period, string> = {
  '24h': '24h',
  '7d': '7 dias',
  '30d': '30 dias',
  '90d': '90 dias',
};

export function PeriodFilter({
  value,
  onChange,
}: {
  value: Period;
  onChange: (p: Period) => void;
}) {
  return (
    <div className="inline-flex rounded-md border bg-muted/30 p-0.5">
      {(Object.keys(LABELS) as Period[]).map((p) => (
        <Button
          key={p}
          variant={value === p ? 'default' : 'ghost'}
          size="sm"
          onClick={() => onChange(p)}
          className="h-8 px-3 text-xs"
        >
          {LABELS[p]}
        </Button>
      ))}
    </div>
  );
}
