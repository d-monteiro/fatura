import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/supabase/client';
import { TenantDetailDrawer } from '@/components/admin/TenantDetailDrawer';
import { sectorLabel } from '@/lib/admin/labels';
import { ChevronRight } from 'lucide-react';
import type { TenantOverview } from '@/types/admin';

export default function AdminTenants() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const { data: tenants = [], isLoading } = useQuery<TenantOverview[]>({
    queryKey: ['admin-tenants-overview'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_admin_tenants_overview');
      if (error) throw error;
      return (data ?? []) as TenantOverview[];
    },
  });

  const filtered = search
    ? tenants.filter((t) =>
        [t.name, t.slug, t.nif, t.sector].some((v) => v?.toLowerCase().includes(search.toLowerCase())),
      )
    : tenants;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Tenants</h1>
        <p className="text-sm text-muted-foreground">{tenants.length} tenant(s) registado(s)</p>
      </div>

      <Input
        placeholder="Pesquisar por nome, slug, NIF ou setor..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-md"
      />

      {isLoading ? (
        <div className="text-muted-foreground">A carregar...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          {tenants.length === 0 ? 'Nenhum tenant de momento.' : 'Sem resultados.'}
        </div>
      ) : (
        <div className="rounded-lg border divide-y">
          {filtered.map((t) => (
            <button
              key={t.id}
              onClick={() => setSelectedId(t.id)}
              className="w-full p-4 flex items-center justify-between text-left hover:bg-muted/50 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{t.name}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {t.slug} · {t.country} · {sectorLabel(t.sector)}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {!t.is_active && <Badge variant="secondary">Suspenso</Badge>}
                <Badge variant={t.plan_status === 'active' ? 'default' : 'secondary'}>{t.plan_status}</Badge>
                <span className="text-xs text-muted-foreground hidden sm:inline">{t.invoices_total} faturas</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </button>
          ))}
        </div>
      )}

      <TenantDetailDrawer tenantId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}
