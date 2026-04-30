import { useState } from 'react';
import { NavLink, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard, FileText, Upload,
  Users, Settings, X, LogOut,
  CreditCard, LifeBuoy, ShieldCheck,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useI18n } from '@/contexts/I18nContext';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useTenant } from '@/contexts/TenantContext';
import { useRole } from '@/hooks/useRole';
import { cn } from '@/lib/cn';
import { CompanySelector } from './CompanySelector';
import { TenantSwitcher } from './TenantSwitcher';
import type { Company } from '@/types/database';
import { queryKeys } from '@/lib/queryKeys';

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [companyOpen, setCompanyOpen] = useState(false);
  const { t } = useI18n();
  const { isAdmin } = useIsAdmin();
  const { tenant } = useTenant();
  const { can } = useRole();
  const tenantId = tenant?.id ?? null;

  const navItems = [
    { to: '/', icon: LayoutDashboard, label: t('nav.dashboard'), show: can('view_dashboard') },
    { to: '/invoices', icon: FileText, label: t('nav.invoices'), show: can('view_invoices') },
    { to: '/upload', icon: Upload, label: t('nav.upload'), show: can('upload_invoice') },
    { to: '/suppliers', icon: Users, label: t('nav.suppliers'), show: can('view_suppliers') },
    { to: '/billing', icon: CreditCard, label: t('nav.billing'), show: can('view_billing') },
    { to: '/tickets', icon: LifeBuoy, label: t('nav.tickets'), show: can('view_tickets') },
    { to: '/settings', icon: Settings, label: t('nav.settings'), show: true },
    ...(isAdmin ? [{ to: '/admin', icon: ShieldCheck, label: 'Admin', show: true }] : []),
  ].filter((item) => item.show);

  const { data: companies = [] } = useQuery({
    queryKey: [...queryKeys.companies, tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('companies').select('*')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data as Company[];
    },
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
  });

  const activeCompany = searchParams.get('company') || 'all';
  const currentLabel = activeCompany === 'all'
    ? t('company.all')
    : companies.find((c) => c.id === activeCompany)?.name ?? t('company.all');

  function selectCompany(id: string) {
    setSearchParams((prev) => { prev.set('company', id); return prev; });
    setCompanyOpen(false);
  }

  const handleNavClick = () => onMobileClose?.();
  const handleLogout = async () => { await supabase.auth.signOut(); };

  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={onMobileClose} />
      )}
      <aside className={cn(
        'fixed inset-y-0 left-0 z-50 flex w-60 flex-col bg-primary text-primary-foreground transition-transform duration-200 ease-in-out',
        'md:z-30 md:translate-x-0',
        mobileOpen ? 'translate-x-0' : '-translate-x-full',
      )}>
        {/* Brand header — tenant logo/name if set, else FaturaAI */}
        <div className="flex h-16 items-center justify-between gap-3 px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            {tenant?.logo_url ? (
              <>
                <img
                  src={tenant.logo_url}
                  alt=""
                  className="h-8 w-8 rounded-md bg-white object-contain p-0.5 shrink-0"
                />
                <span className="truncate text-sm font-semibold tracking-tight">
                  {tenant.name}
                </span>
              </>
            ) : (
              <span className="text-xl font-bold tracking-tight">
                Fatura<span className="text-accent">AI</span>
              </span>
            )}
          </div>
          <button onClick={onMobileClose} className="min-h-[44px] min-w-[44px] flex items-center justify-center md:hidden rounded-lg hover:bg-white/10 shrink-0">
            <X className="h-5 w-5 text-white/70" />
          </button>
        </div>

        <TenantSwitcher />

        <CompanySelector
          companyOpen={companyOpen}
          setCompanyOpen={setCompanyOpen}
          currentLabel={currentLabel}
          activeCompany={activeCompany}
          companies={companies}
          selectCompany={selectCompany}
          allLabel={t('company.all')}
        />

        {/* Navigation */}
        <nav className="flex-1 space-y-0.5 px-3">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} end={to === '/'} onClick={handleNavClick}
              className={({ isActive }) => cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150 min-h-[44px]',
                isActive
                  ? 'bg-accent text-accent-foreground shadow-md'
                  : 'text-white/70 hover:bg-white/10 hover:text-white',
              )}>
              <Icon size={18} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="border-t border-white/10 p-3 space-y-1">
          <button onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/50 hover:bg-white/10 hover:text-red-300 transition-colors">
            <LogOut size={18} />
            <span>{t('nav.logout')}</span>
          </button>
          <p className="px-3 pt-2 text-[11px] text-white/30 tracking-wide">
            {tenant?.logo_url ? 'por FaturaAI' : 'FaturaAI'} &bull; 2026
          </p>
        </div>
      </aside>
    </>
  );
}
