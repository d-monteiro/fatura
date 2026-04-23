import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase/client';
import {
  sectorLabel, countryLabel, documentTypeLabel, folderStructureLabel,
  currencyLabel, AUTO_REPORTS_LABEL, STORAGE_PROVIDER_LABEL,
} from '@/lib/admin/labels';
import { TenantBetaControls } from '@/components/admin/TenantBetaControls';
import type { Tenant, PlanStatus } from '@/types/tenant';
import type { ReportDelivery } from '@/types/admin';

interface Plan { id: string; slug: string; name: string; }
interface Member { user_id: string; email: string; role: string; is_active: boolean; accepted_at: string | null; }
interface RecentError { id: string; level: string; message: string; source: string; created_at: string; resolved: boolean; }
interface TenantDetails {
  invoices_total: number;
  invoices_trashed: number;
  companies_total: number;
  suppliers_total: number;
  members: Member[];
  recent_errors: RecentError[];
  plan: { id: string; name: string; slug: string } | null;
}

const PLAN_STATUS: PlanStatus[] = ['trialing', 'active', 'past_due', 'canceled', 'paused', 'pending_contact'];

interface Props { tenantId: string | null; onClose: () => void; }

export function TenantDetailDrawer({ tenantId, onClose }: Props) {
  const qc = useQueryClient();

  const { data: tenant } = useQuery<Tenant>({
    queryKey: ['admin-tenant', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase.from('tenants').select('*').eq('id', tenantId!).single();
      if (error) throw error;
      return data as Tenant;
    },
  });

  const { data: plans = [] } = useQuery<Plan[]>({
    queryKey: ['admin-plans'],
    queryFn: async () => {
      const { data, error } = await supabase.from('plans').select('id, slug, name').eq('is_active', true).order('price_monthly', { nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as Plan[];
    },
  });

  const { data: details } = useQuery<TenantDetails>({
    queryKey: ['admin-tenant-details', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_tenant_details', { target_tenant: tenantId });
      if (error) throw error;
      return data as TenantDetails;
    },
  });

  const { data: deliveries = [] } = useQuery<ReportDelivery[]>({
    queryKey: ['admin-report-deliveries', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('report_deliveries')
        .select('id, period_kind, period_start, period_end, status, error, sent_at, email_to, invoices_count')
        .eq('tenant_id', tenantId!)
        .order('sent_at', { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data ?? []) as ReportDelivery[];
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (patch: Partial<Tenant>) => {
      if (!tenantId) return;
      const { error } = await supabase.from('tenants').update(patch).eq('id', tenantId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Tenant atualizado');
      qc.invalidateQueries({ queryKey: ['admin-tenants-overview'] });
      qc.invalidateQueries({ queryKey: ['admin-tenant', tenantId] });
      qc.invalidateQueries({ queryKey: ['admin-tenant-details', tenantId] });
    },
    onError: () => toast.error('Erro ao atualizar tenant'),
  });

  if (!tenantId) return null;

  return (
    <Sheet open={!!tenantId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        {!tenant ? (
          <div className="text-muted-foreground">A carregar...</div>
        ) : (
          <>
            <SheetHeader>
              <SheetTitle>{tenant.name}</SheetTitle>
              <p className="text-xs text-muted-foreground">{tenant.slug} · criado {new Date(tenant.created_at).toLocaleDateString('pt-PT')}</p>
            </SheetHeader>

            <div className="space-y-5 mt-6">
              <section className="grid grid-cols-2 gap-3 text-sm">
                <div><div className="text-xs text-muted-foreground">NIF</div><div>{tenant.nif ?? '—'}</div></div>
                <div><div className="text-xs text-muted-foreground">País</div><div>{countryLabel(tenant.country)}</div></div>
                <div><div className="text-xs text-muted-foreground">Setor</div><div>{sectorLabel(tenant.sector)}</div></div>
                <div><div className="text-xs text-muted-foreground">Faturas</div><div>{details?.invoices_total ?? '—'}</div></div>
                <div><div className="text-xs text-muted-foreground">Setup</div><div><Badge variant="outline">{tenant.setup_status}</Badge></div></div>
                <div><div className="text-xs text-muted-foreground">Ativo</div><div><Badge variant={tenant.is_active ? 'default' : 'secondary'}>{tenant.is_active ? 'Sim' : 'Não'}</Badge></div></div>
              </section>

              {details && (
                <section className="grid grid-cols-4 gap-2 text-center">
                  <div className="rounded-md border p-2">
                    <div className="text-xl font-bold">{details.invoices_total}</div>
                    <div className="text-xs text-muted-foreground">Faturas</div>
                  </div>
                  <div className="rounded-md border p-2">
                    <div className="text-xl font-bold">{details.companies_total}</div>
                    <div className="text-xs text-muted-foreground">Empresas</div>
                  </div>
                  <div className="rounded-md border p-2">
                    <div className="text-xl font-bold">{details.suppliers_total}</div>
                    <div className="text-xs text-muted-foreground">Fornecedores</div>
                  </div>
                  <div className="rounded-md border p-2">
                    <div className="text-xl font-bold">{details.invoices_trashed}</div>
                    <div className="text-xs text-muted-foreground">Lixo</div>
                  </div>
                </section>
              )}

              {details && details.members.length > 0 && (
                <section className="space-y-2">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Membros</div>
                  <div className="rounded-md border divide-y">
                    {details.members.map((m) => (
                      <div key={m.user_id} className="p-2 flex items-center justify-between text-sm">
                        <span className="truncate">{m.email}</span>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{m.role}</Badge>
                          {!m.is_active && <Badge variant="secondary">Inativo</Badge>}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {details && details.recent_errors.length > 0 && (
                <section className="space-y-2">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Erros recentes</div>
                  <div className="rounded-md border divide-y">
                    {details.recent_errors.map((e) => (
                      <div key={e.id} className="p-2 text-xs flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="truncate">{e.message}</div>
                          <div className="text-muted-foreground">{e.source} · {new Date(e.created_at).toLocaleString('pt-PT')}</div>
                        </div>
                        <Badge variant={e.level === 'error' || e.level === 'fatal' ? 'destructive' : 'secondary'}>{e.level}</Badge>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <ConfigSection tenant={tenant} />

              {deliveries.length > 0 && (
                <section className="space-y-2">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Relatórios enviados</div>
                  <div className="rounded-md border divide-y">
                    {deliveries.map((d) => (
                      <div key={d.id} className="p-2 text-xs flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="truncate">
                            {d.period_kind === 'weekly' ? 'Semanal' : 'Mensal'} · {d.period_start.split('-').reverse().join('/')} a {d.period_end.split('-').reverse().join('/')}
                          </div>
                          <div className="text-muted-foreground">
                            {new Date(d.sent_at).toLocaleString('pt-PT')} · {d.email_to} · {d.invoices_count} faturas
                            {d.status === 'failed' && d.error ? ` · ${d.error}` : ''}
                          </div>
                        </div>
                        <Badge variant={d.status === 'sent' ? 'default' : 'destructive'}>{d.status}</Badge>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {tenant.setup_error && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs">
                  <div className="font-medium text-destructive mb-1">Erro de setup</div>
                  <div className="text-muted-foreground break-words">{tenant.setup_error}</div>
                </div>
              )}

              <section className="space-y-3 pt-2 border-t">
                <h3 className="text-sm font-semibold">Gestão</h3>
                <div className="space-y-2">
                  <Label>Plano</Label>
                  <Select value={tenant.plan_id ?? ''} onValueChange={(v) => updateMutation.mutate({ plan_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Sem plano" /></SelectTrigger>
                    <SelectContent>
                      {plans.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Estado do plano</Label>
                  <Select value={tenant.plan_status} onValueChange={(v) => updateMutation.mutate({ plan_status: v as PlanStatus })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PLAN_STATUS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button
                    variant={tenant.is_active ? 'outline' : 'default'}
                    className="flex-1"
                    disabled={updateMutation.isPending}
                    onClick={() => updateMutation.mutate({ is_active: !tenant.is_active })}
                  >
                    {tenant.is_active ? 'Suspender' : 'Reativar'}
                  </Button>
                  {tenant.setup_status !== 'ready' && (
                    <Button
                      variant="secondary"
                      className="flex-1"
                      disabled={updateMutation.isPending}
                      onClick={() => updateMutation.mutate({ setup_status: 'ready', setup_error: null })}
                    >
                      Forçar setup OK
                    </Button>
                  )}
                </div>
              </section>

              <TenantBetaControls tenant={tenant} tenantId={tenantId} />
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function ConfigSection({ tenant }: { tenant: Tenant }) {
  const onboarding = (tenant.onboarding_data ?? {}) as Record<string, unknown>;
  const documentTypes = Array.isArray(onboarding.documentTypes)
    ? (onboarding.documentTypes as unknown[]).filter((x): x is string => typeof x === 'string')
    : [];
  const emailAddresses = Array.isArray(onboarding.emailAddresses)
    ? (onboarding.emailAddresses as unknown[]).filter((x): x is string => typeof x === 'string')
    : [];
  const emailSync = onboarding.emailSync === true;

  return (
    <section className="space-y-2">
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Configuração</div>
      <div className="rounded-md border p-3 grid grid-cols-2 gap-3 text-sm">
        <div><div className="text-xs text-muted-foreground">Armazenamento</div><div>{STORAGE_PROVIDER_LABEL[tenant.storage_provider] ?? tenant.storage_provider}</div></div>
        <div><div className="text-xs text-muted-foreground">Estrutura pastas</div><div>{folderStructureLabel(tenant.folder_structure)}</div></div>
        <div><div className="text-xs text-muted-foreground">Google Sheets</div><div>{tenant.auto_sheets ? 'Ativo' : 'Não'}</div></div>
        <div><div className="text-xs text-muted-foreground">Relatórios auto</div><div>{AUTO_REPORTS_LABEL[tenant.auto_reports] ?? tenant.auto_reports}</div></div>
        <div><div className="text-xs text-muted-foreground">Moeda</div><div>{currencyLabel(tenant.currency)}</div></div>
        <div><div className="text-xs text-muted-foreground">Sync email</div><div>{emailSync ? 'Ativo' : 'Não'}</div></div>
        {documentTypes.length > 0 && (
          <div className="col-span-2">
            <div className="text-xs text-muted-foreground mb-1">Tipos de documento</div>
            <div className="flex flex-wrap gap-1">
              {documentTypes.map((d) => <Badge key={d} variant="outline">{documentTypeLabel(d)}</Badge>)}
            </div>
          </div>
        )}
        {tenant.invoice_name_variations && tenant.invoice_name_variations.length > 0 && (
          <div className="col-span-2">
            <div className="text-xs text-muted-foreground mb-1">Variações de nome da fatura</div>
            <div className="flex flex-wrap gap-1">
              {tenant.invoice_name_variations.map((v) => <Badge key={v} variant="outline">{v}</Badge>)}
            </div>
          </div>
        )}
        {emailAddresses.length > 0 && (
          <div className="col-span-2">
            <div className="text-xs text-muted-foreground mb-1">Emails sincronizados</div>
            <div className="flex flex-wrap gap-1">
              {emailAddresses.map((e) => <Badge key={e} variant="outline">{e}</Badge>)}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
