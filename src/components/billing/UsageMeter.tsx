import { Progress } from '@/components/ui/progress';
import { useTenant } from '@/contexts/TenantContext';

export function UsageMeter() {
  const { invoicesUsed, invoicesLimit, isOverLimit } = useTenant();

  const percentage = invoicesLimit
    ? Math.min((invoicesUsed / invoicesLimit) * 100, 100)
    : 0;

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex justify-between items-center">
        <h3 className="font-medium text-sm">Utilisation ce mois</h3>
        <span className={`text-sm font-mono ${isOverLimit ? 'text-destructive' : 'text-muted-foreground'}`}>
          {invoicesUsed} / {invoicesLimit ?? 'Illimité'}
        </span>
      </div>
      {invoicesLimit !== null && (
        <Progress
          value={percentage}
          className={`h-2 ${isOverLimit ? '[&>div]:bg-destructive' : ''}`}
        />
      )}
      {isOverLimit && (
        <p className="text-xs text-destructive">
          Vous avez atteint la limite de votre plan. Passez au plan supérieur pour continuer.
        </p>
      )}
    </div>
  );
}
