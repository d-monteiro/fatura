import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';

interface TenantUsage {
  id: string;
  name: string;
  invoices_this_month: number;
  plan_status: string;
}

export default function AdminUsage() {
  const [tenants, setTenants] = useState<TenantUsage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('tenants')
      .select('id, name, invoices_this_month, plan_status')
      .eq('is_active', true)
      .order('invoices_this_month', { ascending: false })
      .then(({ data }) => {
        if (data) setTenants(data as TenantUsage[]);
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="text-muted-foreground">A carregar...</div>;

  const totalInvoices = tenants.reduce((sum, t) => sum + (t.invoices_this_month ?? 0), 0);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Usage</h1>
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border p-4">
          <div className="text-sm text-muted-foreground">Tenants ativos</div>
          <div className="text-2xl font-bold">{tenants.length}</div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="text-sm text-muted-foreground">Faturas este mês</div>
          <div className="text-2xl font-bold">{totalInvoices}</div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="text-sm text-muted-foreground">Média / tenant</div>
          <div className="text-2xl font-bold">{tenants.length > 0 ? Math.round(totalInvoices / tenants.length) : 0}</div>
        </div>
      </div>

      <div className="rounded-lg border divide-y">
        {tenants.map((t) => (
          <div key={t.id} className="p-4 flex items-center justify-between">
            <span className="font-medium text-sm">{t.name}</span>
            <span className="text-sm text-muted-foreground">{t.invoices_this_month ?? 0} factures</span>
          </div>
        ))}
        {tenants.length === 0 && (
          <div className="text-center py-12 text-muted-foreground text-sm">Nenhum tenant ativo.</div>
        )}
      </div>
    </div>
  );
}
