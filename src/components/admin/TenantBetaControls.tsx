import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase/client';
import { isUnlimitedTrial } from '@/lib/utils/trial';
import type { Tenant } from '@/types/tenant';

interface Props {
  tenant: Tenant;
  tenantId: string;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

export function TenantBetaControls({ tenant, tenantId }: Props) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin-tenant', tenantId] });
    qc.invalidateQueries({ queryKey: ['admin-tenant-details', tenantId] });
  };

  const resetMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('admin_reset_tenant_invoices', { target_tenant: tenantId });
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Contador de faturas reiniciado'); invalidate(); },
    onError: (e: Error) => toast.error(e.message ?? 'Erro ao resetar'),
  });

  const patchMutation = useMutation({
    mutationFn: async (patch: Partial<Tenant>) => {
      const { error } = await supabase.from('tenants').update(patch).eq('id', tenantId);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Tenant atualizado'); invalidate(); },
    onError: () => toast.error('Erro ao atualizar'),
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/sync-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token ?? ''}`,
          'apikey': SUPABASE_ANON,
          'x-admin-tenant-id': tenantId,
        },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error ?? 'Sync falhou');
      }
      return res.json() as Promise<{ discovered?: number; duplicates?: number; messages_found?: number }>;
    },
    onSuccess: (r) => toast.success(`Sync: ${r.discovered ?? 0} novas · ${r.duplicates ?? 0} duplicadas`),
    onError: (e: Error) => toast.error(e.message ?? 'Erro sync'),
  });

  const setTrialPreset = (days: number | 'infinite') => {
    if (days === 'infinite') {
      patchMutation.mutate({ trial_ends_at: '2099-12-31T23:59:59Z' });
      return;
    }
    const base = tenant.trial_ends_at ? new Date(tenant.trial_ends_at) : new Date();
    const start = Math.max(base.getTime(), Date.now());
    const target = new Date(start + days * 24 * 3600 * 1000);
    patchMutation.mutate({ trial_ends_at: target.toISOString() });
  };

  const stripeCustomerUrl = tenant.stripe_customer_id
    ? `https://dashboard.stripe.com/customers/${tenant.stripe_customer_id}`
    : 'https://dashboard.stripe.com/coupons';

  const trialDateValue = tenant.trial_ends_at ? tenant.trial_ends_at.substring(0, 10) : '';
  const resetLabel = tenant.invoices_month_reset
    ? new Date(tenant.invoices_month_reset).toLocaleString('pt-PT')
    : 'nunca';

  return (
    <section className="space-y-4 pt-4 border-t">
      <h3 className="text-sm font-semibold">Controlos beta</h3>

      <div className="space-y-2">
        <Label>Contador de faturas (mês)</Label>
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs text-muted-foreground">Último reset: {resetLabel}</div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => resetMutation.mutate()}
            disabled={resetMutation.isPending}
          >
            {resetMutation.isPending ? 'A resetar...' : 'Reset contador'}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Fim do trial</Label>
        <Input
          type="date"
          value={trialDateValue}
          onChange={(e) => {
            if (e.target.value) {
              patchMutation.mutate({ trial_ends_at: new Date(e.target.value).toISOString() });
            }
          }}
        />
        {isUnlimitedTrial(tenant.trial_ends_at) && (
          <p className="text-xs text-primary font-medium">Atual: duração indefinida</p>
        )}
        <div className="flex gap-1">
          <Button size="sm" variant="outline" onClick={() => setTrialPreset(7)}>+7d</Button>
          <Button size="sm" variant="outline" onClick={() => setTrialPreset(30)}>+30d</Button>
          <Button size="sm" variant="outline" onClick={() => setTrialPreset('infinite')}>Sem fim</Button>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Descontos</Label>
        <p className="text-xs text-muted-foreground">
          Geridos no Stripe. Aplicar coupon ao cliente ou criar promotion code partilhável.
        </p>
        <Button size="sm" variant="outline" asChild>
          <a href={stripeCustomerUrl} target="_blank" rel="noopener noreferrer">
            {tenant.stripe_customer_id ? 'Abrir cliente no Stripe' : 'Abrir coupons Stripe'}
          </a>
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        <Button
          variant="outline"
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
        >
          {syncMutation.isPending ? 'A sincronizar...' : 'Forçar sync email agora'}
        </Button>
        <Button variant="outline" asChild>
          <Link to={`/admin/errors?tenant_id=${tenantId}`}>Ver erros deste tenant</Link>
        </Button>
      </div>
    </section>
  );
}
