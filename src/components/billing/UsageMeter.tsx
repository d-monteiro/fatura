import { Progress } from '@/components/ui/progress';
import { useTenant } from '@/contexts/TenantContext';

export function UsageMeter() {
  const { invoicesUsed, invoicesLimit, isOverLimit } = useTenant();

  const percentage = invoicesLimit
    ? Math.min((invoicesUsed / invoicesLimit) * 100, 100)
    : 0;

  return (
    <div className="rounded-xl border bg-background/80 backdrop-blur p-4 space-y-2.5 shadow-sm">
      <div className="flex justify-between items-baseline">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Este mês
        </span>
        <span className={`text-sm font-mono tabular-nums ${isOverLimit ? 'text-destructive' : ''}`}>
          <span className="font-semibold">{invoicesUsed}</span>
          <span className="text-muted-foreground"> / {invoicesLimit ?? '∞'}</span>
        </span>
      </div>
      {invoicesLimit !== null ? (
        <>
          <Progress
            value={percentage}
            className={`h-2 ${isOverLimit ? '[&>div]:bg-destructive' : ''}`}
          />
          <div className="text-[11px] text-muted-foreground">
            {Math.round(percentage)}% usado
          </div>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">Faturas ilimitadas no seu plano.</p>
      )}
      {isOverLimit && (
        <p className="text-xs text-destructive font-medium">
          Limite atingido — faça upgrade para continuar.
        </p>
      )}
    </div>
  );
}
