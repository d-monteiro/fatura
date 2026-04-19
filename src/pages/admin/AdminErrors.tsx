import { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { supabase } from '@/lib/supabase/client';
import { ErrorDetailDrawer } from '@/components/admin/ErrorDetailDrawer';
import type { ErrorLog } from '@/types/tickets';
import { ChevronRight, X } from 'lucide-react';

const LEVEL_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  debug: 'outline', info: 'secondary', warn: 'default', error: 'destructive', fatal: 'destructive',
};

type Filter = 'unresolved' | 'all' | 'resolved';

export default function AdminErrors() {
  const [selected, setSelected] = useState<ErrorLog | null>(null);
  const [filter, setFilter] = useState<Filter>('unresolved');
  const [searchParams, setSearchParams] = useSearchParams();
  const tenantId = searchParams.get('tenant_id');

  const { data: errors = [], isLoading } = useQuery<ErrorLog[]>({
    queryKey: ['admin-errors', tenantId],
    queryFn: async () => {
      let query = supabase.from('error_logs').select('*').order('created_at', { ascending: false }).limit(200);
      if (tenantId) query = query.eq('tenant_id', tenantId);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as ErrorLog[];
    },
  });

  const { data: tenantName } = useQuery<string | null>({
    queryKey: ['admin-tenant-name', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase.from('tenants').select('name').eq('id', tenantId!).maybeSingle();
      return data?.name ?? null;
    },
  });

  const filtered = errors.filter((e) => {
    if (filter === 'resolved') return e.resolved;
    if (filter === 'unresolved') return !e.resolved;
    return true;
  });

  const unresolvedCount = errors.filter((e) => !e.resolved).length;

  const clearTenantFilter = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('tenant_id');
    setSearchParams(next);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Erros</h1>
          <p className="text-sm text-muted-foreground">{unresolvedCount} por resolver · {errors.length} total (últimos 200)</p>
        </div>
        <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="unresolved">Por resolver</SelectItem>
            <SelectItem value="resolved">Resolvidos</SelectItem>
            <SelectItem value="all">Todos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {tenantId && (
        <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
          <span className="text-muted-foreground">Filtrado por tenant:</span>
          <Link to="/admin/tenants" className="font-medium underline-offset-2 hover:underline">
            {tenantName ?? tenantId.slice(0, 8)}
          </Link>
          <Button size="sm" variant="ghost" onClick={clearTenantFilter} className="ml-auto h-7 gap-1">
            <X className="h-3 w-3" /> Limpar
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="text-muted-foreground">A carregar...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Nenhum erro.</div>
      ) : (
        <div className="rounded-lg border divide-y">
          {filtered.map((err) => (
            <button
              key={err.id}
              onClick={() => setSelected(err)}
              className="w-full p-4 text-left hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center justify-between gap-3 mb-1">
                <span className="font-medium text-sm truncate">{err.message}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={LEVEL_VARIANT[err.level] ?? 'outline'}>{err.level}</Badge>
                  {err.resolved && <Badge variant="secondary">OK</Badge>}
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                {err.source} · {err.function_name ?? '—'} · {new Date(err.created_at).toLocaleString('pt-PT')}
              </div>
            </button>
          ))}
        </div>
      )}

      <ErrorDetailDrawer error={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
