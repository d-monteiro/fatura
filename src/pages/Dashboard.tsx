import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase/client';
import { useI18n } from '@/contexts/I18nContext';
import { Euro, Lock, TrendingUp, AlertTriangle } from 'lucide-react';
import { useCompanyFilter } from '@/hooks/useCompanyFilter';
import { useTenant } from '@/contexts/TenantContext';
import { useCategories } from '@/hooks/useCategories';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { TrendChart } from '@/components/dashboard/TrendChart';
import { CategoryDonut } from '@/components/dashboard/CategoryDonut';
import { RecentInvoicesTable } from '@/components/dashboard/RecentInvoicesTable';
import { SyncEmailsCard } from '@/components/dashboard/SyncEmailsCard';
import { ExternalIntegrationsCard } from '@/components/dashboard/ExternalIntegrationsCard';
import { DuplicatesWidget } from '@/components/dashboard/DuplicatesWidget';
import { UpcomingPaymentsWidget } from '@/components/dashboard/UpcomingPaymentsWidget';
import { queryKeys } from '@/lib/queryKeys';
import { ConnectGoogleBanner } from '@/components/common/ConnectGoogleBanner';

export default function Dashboard() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { companyId } = useCompanyFilter();
  const { tenant } = useTenant();
  const { isFixed } = useCategories(tenant?.id);

  const { data: metrics } = useQuery({
    queryKey: queryKeys.dashboardByCompany(companyId),
    queryFn: async () => {
      // B8: avisos de pagamento são pré-avisos de débito futuro, não custos.
      // Excluí-los aqui mantém os totais do dashboard fiéis ao gasto real.
      let query = supabase
        .from('invoices')
        .select('valor_total, category, status')
        .is('deleted_at', null)
        .or('document_type.is.null,document_type.neq.aviso_pagamento');

      if (companyId) query = query.eq('company_id', companyId);

      const { data: invoices, error } = await query;
      if (error) throw error;
      return invoices ?? [];
    },
  });

  const total = (metrics ?? []).reduce((s, r) => s + (r.valor_total ?? 0), 0);
  const fixos = (metrics ?? [])
    .filter((r) => isFixed(r.category))
    .reduce((s, r) => s + (r.valor_total ?? 0), 0);
  const variaveis = total - fixos;
  const toReview = (metrics ?? [])
    .filter((r) => r.status === 'review')
    .reduce((s, r) => s + (r.valor_total ?? 0), 0);

  return (
    <div className="animate-fade-in space-y-4 sm:space-y-6">
      <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">{t('nav.dashboard')}</h1>

      <ConnectGoogleBanner />

      <SyncEmailsCard />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <div className="animate-fade-in-up" style={{ animationDelay: '0ms' }}>
          <MetricCard
            title={t('dash.total_expenses')}
            value={total}
            icon={Euro}
            trend={null}
            color="bg-blue-500"
            variant="gradient"
            onClick={() => navigate('/invoices')}
          />
        </div>
        <div className="animate-fade-in-up" style={{ animationDelay: '80ms' }}>
          <MetricCard
            title={t('dash.fixed_costs')}
            value={fixos}
            icon={Lock}
            trend={null}
            color="bg-violet-500"
          />
        </div>
        <div className="animate-fade-in-up" style={{ animationDelay: '160ms' }}>
          <MetricCard
            title={t('dash.variable_costs')}
            value={variaveis}
            icon={TrendingUp}
            trend={null}
            color="bg-cyan-500"
          />
        </div>
        <div className="animate-fade-in-up" style={{ animationDelay: '240ms' }}>
          <MetricCard
            title={t('dash.to_review')}
            value={toReview}
            icon={AlertTriangle}
            trend={null}
            color="bg-amber-500"
            onClick={() => navigate('/invoices?tab=review')}
          />
        </div>
      </div>

      <ExternalIntegrationsCard />

      <DuplicatesWidget />

      <UpcomingPaymentsWidget />

      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
        <TrendChart companyId={companyId} />
        <CategoryDonut companyId={companyId} />
      </div>

      <RecentInvoicesTable companyId={companyId} />
    </div>
  );
}
