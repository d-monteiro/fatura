import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import type { TenantOverview } from '@/types/admin';

export default function AdminUsage() {
  const { data: tenants = [], isLoading } = useQuery<TenantOverview[]>({
    queryKey: ['admin-tenants-overview'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_admin_tenants_overview');
      if (error) throw error;
      return (data ?? []) as TenantOverview[];
    },
  });

  if (isLoading) return <div className="text-muted-foreground">A carregar...</div>;

  const activeTenants = tenants.filter((t) => t.is_active);
  const totalInvoicesMonth = tenants.reduce((sum, t) => sum + t.invoices_this_month, 0);
  const totalInvoicesAllTime = tenants.reduce((sum, t) => sum + t.invoices_total, 0);
  const avgMonth = activeTenants.length > 0 ? Math.round(totalInvoicesMonth / activeTenants.length) : 0;

  const sorted = [...tenants].sort((a, b) => b.invoices_this_month - a.invoices_this_month);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Utilização</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-lg border p-4">
          <div className="text-xs text-muted-foreground">Tenants ativos</div>
          <div className="text-2xl font-bold">{activeTenants.length}</div>
          <div className="text-xs text-muted-foreground">{tenants.length} total</div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="text-xs text-muted-foreground">Faturas este mês</div>
          <div className="text-2xl font-bold">{totalInvoicesMonth}</div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="text-xs text-muted-foreground">Faturas total</div>
          <div className="text-2xl font-bold">{totalInvoicesAllTime}</div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="text-xs text-muted-foreground">Média / tenant / mês</div>
          <div className="text-2xl font-bold">{avgMonth}</div>
        </div>
      </div>

      <div className="rounded-lg border divide-y">
        <div className="grid grid-cols-5 gap-2 px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          <div className="col-span-2">Tenant</div>
          <div className="text-right">Mês</div>
          <div className="text-right">Total</div>
          <div className="text-right">Fornecedores</div>
        </div>
        {sorted.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">Nenhum tenant.</div>
        ) : (
          sorted.map((t) => (
            <div key={t.id} className="grid grid-cols-5 gap-2 px-4 py-3 text-sm items-center">
              <div className="col-span-2 min-w-0">
                <div className="font-medium truncate">{t.name}</div>
                {!t.is_active && <div className="text-xs text-muted-foreground">Suspenso</div>}
              </div>
              <div className="text-right font-mono">{t.invoices_this_month}</div>
              <div className="text-right font-mono text-muted-foreground">{t.invoices_total}</div>
              <div className="text-right font-mono text-muted-foreground">{t.suppliers_total}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
