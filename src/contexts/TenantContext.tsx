import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { queryKeys } from '@/lib/queryKeys';
import { applyBranding, clearBranding } from '@/lib/branding/applyBranding';
import { identifyTenant } from '@/lib/analytics/track';
import { reportError } from '@/lib/errors/errorReporter';
import type { Tenant, Plan, TenantRole } from '@/types/tenant';

interface TenantSummary {
  id: string;
  name: string;
  role: TenantRole;
}

interface TenantContextType {
  tenant: Tenant | null;
  tenants: TenantSummary[];
  plan: Plan | null;
  role: TenantRole;
  loading: boolean;

  // Usage
  invoicesUsed: number;
  invoicesLimit: number | null;
  isOverLimit: boolean;

  // Feature gates
  canUseEmailSync: boolean;
  canUseAutoSheets: boolean;
  canUseReports: boolean;
  canUseAPI: boolean;
  canInviteUsers: boolean;

  // Actions
  refreshTenant: () => Promise<void>;
  switchTenant: (tenantId: string) => Promise<void>;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);
const TENANT_STORAGE_KEY = 'faturai-current-tenant';

export function TenantProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [role, setRole] = useState<TenantRole>('member');
  const [loading, setLoading] = useState(true);
  const [currentTenantId, setCurrentTenantId] = useState<string | null>(() => {
    try { return localStorage.getItem(TENANT_STORAGE_KEY); } catch { return null; }
  });

  const loadTenant = useCallback(async () => {
    if (authLoading) { setLoading(true); return; }

    if (!user) {
      setTenant(null);
      setTenants([]);
      setPlan(null);
      setRole('member');
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data: memberships, error: tuError } = await supabase
        .from('tenant_users')
        .select('tenant_id, role, tenants!inner(id, name, deleted_at)')
        .eq('user_id', user.id)
        .eq('is_active', true);

      if (tuError || !memberships || memberships.length === 0) {
        setTenant(null);
        setTenants([]);
        setPlan(null);
        setLoading(false);
        return;
      }

      type MembershipRow = {
        tenant_id: string;
        role: string;
        tenants: { id: string; name: string; deleted_at: string | null } | Array<{ id: string; name: string; deleted_at: string | null }> | null;
      };
      const summary: TenantSummary[] = (memberships as unknown as MembershipRow[])
        .map((m) => {
          const t = Array.isArray(m.tenants) ? m.tenants[0] : m.tenants;
          return t && !t.deleted_at
            ? { id: m.tenant_id, name: t.name, role: m.role as TenantRole }
            : null;
        })
        .filter((x): x is TenantSummary => x !== null);
      setTenants(summary);

      if (summary.length === 0) {
        setTenant(null);
        setPlan(null);
        setLoading(false);
        return;
      }

      // Pick current tenant: stored preference (if still member) else first
      const resolvedId = currentTenantId && summary.find((s) => s.id === currentTenantId)
        ? currentTenantId
        : summary[0].id;
      if (resolvedId !== currentTenantId) {
        try { localStorage.setItem(TENANT_STORAGE_KEY, resolvedId); } catch { /* ignore */ }
        setCurrentTenantId(resolvedId);
      }

      const resolved = summary.find((s) => s.id === resolvedId)!;
      setRole(resolved.role);

      const { data: tenantData, error: tError } = await supabase
        .from('tenants')
        .select('*')
        .eq('id', resolvedId)
        .maybeSingle();

      if (tError || !tenantData) {
        setTenant(null);
        setLoading(false);
        return;
      }

      setTenant(tenantData as Tenant);

      if (tenantData.plan_id) {
        const { data: planData } = await supabase
          .from('plans')
          .select('*')
          .eq('id', tenantData.plan_id)
          .single();

        setPlan(planData as Plan | null);
      } else {
        setPlan(null);
      }
    } catch (err) {
      void reportError(err, { component: 'TenantContext/loadTenant', userId: user?.id });
      setTenant(null);
      setPlan(null);
    } finally {
      setLoading(false);
    }
  }, [user, authLoading, currentTenantId]);

  useEffect(() => {
    loadTenant();
  }, [loadTenant]);

  useEffect(() => {
    if (!tenant) {
      clearBranding();
      return;
    }
    applyBranding(tenant.primary_color, tenant.secondary_color);
    return clearBranding;
  }, [tenant]);

  useEffect(() => {
    if (!tenant?.id) return;
    identifyTenant(tenant.id, {
      name: tenant.name,
      plan: plan?.slug,
      plan_status: tenant.plan_status,
      country: tenant.country,
    });
  }, [tenant?.id, tenant?.name, tenant?.plan_status, tenant?.country, plan?.slug]);

  const switchTenant = useCallback(async (tenantId: string) => {
    const match = tenants.find((t) => t.id === tenantId);
    if (!match) throw new Error('Tenant inacessível');
    try { localStorage.setItem(TENANT_STORAGE_KEY, tenantId); } catch { /* ignore */ }
    setCurrentTenantId(tenantId);
  }, [tenants]);

  const { data: invoicesUsed = 0 } = useQuery({
    queryKey: queryKeys.invoicesUsage(tenant?.id ?? null),
    enabled: !!tenant?.id,
    queryFn: async () => {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      // Reset admin tem precedência se for mais recente que o início do mês
      const resetAt = tenant!.invoices_month_reset ? new Date(tenant!.invoices_month_reset) : null;
      const lowerBound = resetAt && resetAt > monthStart ? resetAt : monthStart;
      const { count } = await supabase
        .from('invoices')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenant!.id)
        .is('deleted_at', null)
        .gte('created_at', lowerBound.toISOString());
      return count ?? 0;
    },
  });
  const invoicesLimit = plan?.max_invoices_month ?? null;
  const isOverLimit = invoicesLimit !== null && invoicesUsed >= invoicesLimit;

  const value: TenantContextType = {
    tenant,
    tenants,
    plan,
    role,
    loading,

    invoicesUsed,
    invoicesLimit,
    isOverLimit,

    canUseEmailSync: plan?.has_email_sync ?? false,
    canUseAutoSheets: plan?.has_auto_sheets ?? false,
    canUseReports: plan?.has_reports ?? false,
    canUseAPI: plan?.has_api_access ?? false,
    canInviteUsers: plan?.has_multi_user ?? false,

    refreshTenant: loadTenant,
    switchTenant,
  };

  return (
    <TenantContext.Provider value={value}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  const context = useContext(TenantContext);
  if (context === undefined) {
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return context;
}

export function useTenantOptional() {
  return useContext(TenantContext) ?? null;
}
