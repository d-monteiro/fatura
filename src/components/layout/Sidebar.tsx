import { useState } from 'react';
import { NavLink, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard,
  Inbox,
  FileText,
  Upload,
  Users,
  Settings,
  Zap,
  ChevronDown,
  Globe,
  X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useI18n } from '@/contexts/I18nContext';
import { cn } from '@/lib/cn';
import type { Company } from '@/types/database';

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [companyOpen, setCompanyOpen] = useState(false);
  const { lang, setLang, t } = useI18n();

  const navItems = [
    { to: '/', icon: LayoutDashboard, label: t('nav.dashboard') },
    { to: '/inbox', icon: Inbox, label: t('nav.inbox') },
    { to: '/invoices', icon: FileText, label: t('nav.invoices') },
    { to: '/upload', icon: Upload, label: t('nav.upload') },
    { to: '/suppliers', icon: Users, label: t('nav.suppliers') },
    { to: '/automations', icon: Zap, label: t('nav.automations') },
    { to: '/settings', icon: Settings, label: t('nav.settings') },
  ];

  const { data: companies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data as Company[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const activeCompany = searchParams.get('company') || 'all';

  const currentLabel =
    activeCompany === 'all'
      ? t('company.all')
      : companies.find((c) => c.id === activeCompany)?.name ?? t('company.all');

  function selectCompany(id: string) {
    setSearchParams((prev) => {
      prev.set('company', id);
      return prev;
    });
    setCompanyOpen(false);
  }

  function toggleLang() {
    setLang(lang === 'fr' ? 'pt' : 'fr');
  }

  const handleNavClick = () => {
    onMobileClose?.();
  };

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={onMobileClose}
        />
      )}
      <aside className={cn(
        'fixed inset-y-0 left-0 z-50 flex w-60 flex-col bg-primary text-primary-foreground transition-transform duration-200 ease-in-out',
        'md:z-30 md:translate-x-0',
        mobileOpen ? 'translate-x-0' : '-translate-x-full',
      )}>
      {/* Logo */}
      <div className="flex h-16 items-center justify-between px-6">
        <span className="text-xl font-bold tracking-tight">
          Fatura<span className="text-accent">AI</span>
        </span>
        <button onClick={onMobileClose} className="min-h-[44px] min-w-[44px] flex items-center justify-center md:hidden rounded-lg hover:bg-white/10">
          <X className="h-5 w-5 text-white/70" />
        </button>
      </div>

      {/* Company selector */}
      <div className="relative px-3 pb-4">
        <button
          onClick={() => setCompanyOpen(!companyOpen)}
          className="flex w-full items-center justify-between rounded-md bg-white/10 px-3 py-2 text-sm hover:bg-white/15"
        >
          <span>{currentLabel}</span>
          <ChevronDown size={16} className={cn('transition-transform', companyOpen && 'rotate-180')} />
        </button>
        {companyOpen && (
          <div className="absolute left-3 right-3 top-full mt-1 rounded-md bg-white text-foreground shadow-lg">
            <button
              onClick={() => selectCompany('all')}
              className={cn(
                'block w-full px-3 py-2 text-left text-sm hover:bg-muted',
                activeCompany === 'all' && 'font-semibold text-accent-foreground',
              )}
            >
              {t('company.all')}
            </button>
            {companies.map((c) => (
              <button
                key={c.id}
                onClick={() => selectCompany(c.id)}
                className={cn(
                  'block w-full px-3 py-2 text-left text-sm hover:bg-muted',
                  c.id === activeCompany && 'font-semibold text-accent-foreground',
                )}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            onClick={handleNavClick}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors min-h-[44px]',
                isActive
                  ? 'bg-accent text-accent-foreground'
                  : 'text-white/70 hover:bg-white/10 hover:text-white',
              )
            }
          >
            <Icon size={18} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Language toggle */}
      <div className="border-t border-white/10 p-3">
        <button
          onClick={toggleLang}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white"
        >
          <Globe size={18} />
          <span>{lang === 'fr' ? 'FR' : 'PT'}</span>
          <span className="ml-auto text-xs text-white/40">
            {lang === 'fr' ? 'Portugais' : 'Fran\u00e7ais'}
          </span>
        </button>
      </div>
    </aside>
    </>
  );
}
