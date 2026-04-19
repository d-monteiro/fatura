interface Props {
  label: string;
  value: string | number;
  hint?: string;
  loading?: boolean;
}

export function KpiCard({ label, value, hint, loading }: Props) {
  return (
    <div className="rounded-lg border p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">
        {loading ? <span className="text-muted-foreground">—</span> : value}
      </div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}
