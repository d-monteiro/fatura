import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase/client';
import { useI18n } from '@/contexts/I18nContext';
import { Euro, Lock, TrendingUp, AlertTriangle } from 'lucide-react';
import { useCompanyFilter } from '@/hooks/useCompanyFilter';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { TrendChart } from '@/components/dashboard/TrendChart';
import { CategoryDonut } from '@/components/dashboard/CategoryDonut';
import { RecentInvoicesTable } from '@/components/dashboard/RecentInvoicesTable';

export default function Dashboard() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { companyId } = useCompanyFilter();

  const { data: metrics } = useQuery({
    queryKey: ['dashboard-metrics', companyId],
    queryFn: async () => {
      let query = supabase
        .from('invoices')
        .select('montant_ttc, cost_type, status')
        .is('deleted_at', null);

      if (companyId) {
        query = query.eq('company_id', companyId);
      }

      const { data: invoices, error } = await query;
      if (error) throw error;

      const rows = invoices ?? [];
      const totalDepenses = rows.reduce((s, r) => s + (r.montant_ttc ?? 0), 0);
      const coutsFixed = rows
        .filter((r) => r.cost_type === 'cout_fixe')
        .reduce((s, r) => s + (r.montant_ttc ?? 0), 0);
      const coutsVar = rows
        .filter((r) => r.cost_type === 'cout_variable')
        .reduce((s, r) => s + (r.montant_ttc ?? 0), 0);
      const toReview = rows
        .filter((r) => r.status === 'review' || r.status === 'inbox')
        .reduce((s, r) => s + (r.montant_ttc ?? 0), 0);

      return { totalDepenses, coutsFixed, coutsVar, toReview };
    },
  });

  return (
    <div className="animate-fade-in space-y-4 sm:space-y-6">
      <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">{t('nav.dashboard')}</h1>

      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <div className="animate-fade-in-up" style={{ animationDelay: '0ms' }}>
          <MetricCard
            title={t('dash.total_expenses')}
            value={metrics?.totalDepenses ?? null}
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
            value={metrics?.coutsFixed ?? null}
            icon={Lock}
            trend={null}
            color="bg-violet-500"
            onClick={() => navigate('/invoices?cost_type=cout_fixe')}
          />
        </div>
        <div className="animate-fade-in-up" style={{ animationDelay: '160ms' }}>
          <MetricCard
            title={t('dash.variable_costs')}
            value={metrics?.coutsVar ?? null}
            icon={TrendingUp}
            trend={null}
            color="bg-cyan-500"
            onClick={() => navigate('/invoices?cost_type=cout_variable')}
          />
        </div>
        <div className="animate-fade-in-up" style={{ animationDelay: '240ms' }}>
          <MetricCard
            title={t('dash.to_review')}
            value={metrics?.toReview ?? null}
            icon={AlertTriangle}
            trend={null}
            color="bg-amber-500"
            onClick={() => navigate('/inbox')}
          />
        </div>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
        <TrendChart companyId={companyId} />
        <CategoryDonut companyId={companyId} />
      </div>

      {/* Recent invoices */}
      <RecentInvoicesTable companyId={companyId} />
    </div>
  );
}
