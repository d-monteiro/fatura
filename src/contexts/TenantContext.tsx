import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { Tenant, Plan, TenantRole } from '@/types/tenant';

interface TenantContextType {
  tenant: Tenant | null;
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
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

export function TenantProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [role, setRole] = useState<TenantRole>('member');
  const [loading, setLoading] = useState(true);

  const loadTenant = useCallback(async () => {
    if (!user) {
      setTenant(null);
      setPlan(null);
      setRole('member');
      setLoading(false);
      return;
    }

    try {
      // Get the user's tenant membership (maybeSingle handles 0-row case without 406)
      const { data: tenantUser, error: tuError } = await supabase
        .from('tenant_users')
        .select('tenant_id, role')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (tuError || !tenantUser) {
        setTenant(null);
        setPlan(null);
        setLoading(false);
        return;
      }

      setRole(tenantUser.role as TenantRole);

      // Load tenant data
      const { data: tenantData, error: tError } = await supabase
        .from('tenants')
        .select('*')
        .eq('id', tenantUser.tenant_id)
        .maybeSingle();

      if (tError || !tenantData) {
        setTenant(null);
        setLoading(false);
        return;
      }

      setTenant(tenantData as Tenant);

      // Load plan if tenant has one
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
    } catch {
      setTenant(null);
      setPlan(null);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadTenant();
  }, [loadTenant]);

  const invoicesUsed = tenant?.invoices_this_month ?? 0;
  const invoicesLimit = plan?.max_invoices_month ?? null;
  const isOverLimit = invoicesLimit !== null && invoicesUsed >= invoicesLimit;

  const value: TenantContextType = {
    tenant,
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
