import { useTenant } from '@/contexts/TenantContext';
import { UsageMeter } from '@/components/billing/UsageMeter';
import { PlanSelector } from '@/components/billing/PlanSelector';
import { Badge } from '@/components/ui/badge';

const STATUS_LABELS: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  trialing: { label: 'Essai gratuit', variant: 'secondary' },
  active: { label: 'Actif', variant: 'default' },
  past_due: { label: 'Paiement en retard', variant: 'destructive' },
  canceled: { label: 'Annulé', variant: 'destructive' },
  paused: { label: 'En pause', variant: 'outline' },
  pending_contact: { label: 'En attente', variant: 'outline' },
};

export default function Billing() {
  const { tenant, plan } = useTenant();

  const status = STATUS_LABELS[tenant?.plan_status ?? ''] ?? STATUS_LABELS.active;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Facturation</h1>
        <p className="text-muted-foreground">Gérez votre abonnement et votre utilisation.</p>
      </div>

      <div className="rounded-lg border p-4 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">Plan actuel</h3>
          <Badge variant={status.variant}>{status.label}</Badge>
        </div>
        <div className="text-2xl font-bold">{plan?.name ?? 'Aucun plan'}</div>
        {tenant?.trial_ends_at && (
          <p className="text-sm text-muted-foreground">
            Essai gratuit jusqu'au {new Date(tenant.trial_ends_at).toLocaleDateString('fr-FR')}
          </p>
        )}
      </div>

      <UsageMeter />

      <PlanSelector />

      {!tenant?.stripe_customer_id && (
        <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          L'intégration Stripe sera activée prochainement.
          Les changements de plan seront disponibles une fois la configuration Stripe terminée.
        </div>
      )}
    </div>
  );
}
