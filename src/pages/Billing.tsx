import { useTenant } from '@/contexts/TenantContext';
import { UsageMeter } from '@/components/billing/UsageMeter';
import { PlanSelector } from '@/components/billing/PlanSelector';
import { Badge } from '@/components/ui/badge';

const STATUS_LABELS: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  trialing: { label: 'Teste grátis', variant: 'secondary' },
  active: { label: 'Ativo', variant: 'default' },
  past_due: { label: 'Pagamento em atraso', variant: 'destructive' },
  canceled: { label: 'Cancelado', variant: 'destructive' },
  paused: { label: 'Em pausa', variant: 'outline' },
  pending_contact: { label: 'Em espera', variant: 'outline' },
};

export default function Billing() {
  const { tenant, plan } = useTenant();

  const status = STATUS_LABELS[tenant?.plan_status ?? ''] ?? STATUS_LABELS.active;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Faturação</h1>
        <p className="text-muted-foreground">Gira a sua subscrição e utilização.</p>
      </div>

      <div className="rounded-lg border p-4 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">Plano atual</h3>
          <Badge variant={status.variant}>{status.label}</Badge>
        </div>
        <div className="text-2xl font-bold">{plan?.name ?? 'Sem plano'}</div>
        {tenant?.trial_ends_at && (
          <p className="text-sm text-muted-foreground">
            Teste grátis até {new Date(tenant.trial_ends_at).toLocaleDateString('pt-PT')}
          </p>
        )}
      </div>

      <UsageMeter />

      <PlanSelector />

      {!tenant?.stripe_customer_id && (
        <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          A integração Stripe será ativada em breve.
          As alterações de plano ficarão disponíveis após a configuração do Stripe.
        </div>
      )}
    </div>
  );
}
