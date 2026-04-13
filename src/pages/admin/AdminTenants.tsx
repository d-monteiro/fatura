import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase/client';
import type { Tenant } from '@/types/tenant';

export default function AdminTenants() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Admin uses service role in Edge Functions.
    // For now, this relies on the user being a member of all tenants or service role.
    supabase
      .from('tenants')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) setTenants(data as Tenant[]);
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="text-muted-foreground">Chargement...</div>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Tenants</h1>
      <p className="text-muted-foreground">{tenants.length} tenant(s) enregistré(s)</p>

      {tenants.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Aucun tenant pour le moment.</div>
      ) : (
        <div className="rounded-lg border divide-y">
          {tenants.map((t) => (
            <div key={t.id} className="p-4 flex items-center justify-between">
              <div>
                <div className="font-medium">{t.name}</div>
                <div className="text-xs text-muted-foreground">{t.slug} &middot; {t.country} &middot; {t.sector ?? '—'}</div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={t.plan_status === 'active' ? 'default' : 'secondary'}>
                  {t.plan_status}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {t.invoices_this_month ?? 0} factures
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
