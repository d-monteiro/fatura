import type { LucideIcon } from 'lucide-react';
import { formatEUR } from '@/lib/utils/validation';
import { useI18n } from '@/contexts/I18nContext';

interface MetricCardProps {
  title: string;
  value: number | null;
  icon: LucideIcon;
  trend?: number | null;
  color: string;
}

export function MetricCard({ title, value, icon: Icon, trend, color }: MetricCardProps) {
  const { t } = useI18n();
  const trendPositive = trend !== null && trend !== undefined && trend >= 0;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-500">{title}</p>
        <div className={`rounded-xl p-2.5 ${color}`}>
          <Icon className="h-5 w-5 text-white" />
        </div>
      </div>
      <p className="mt-3 text-2xl font-bold text-gray-900">{formatEUR(value)}</p>
      {trend !== null && trend !== undefined && (
        <p className={`mt-1 text-sm ${trendPositive ? 'text-red-500' : 'text-green-600'}`}>
          {trendPositive ? '+' : ''}{trend.toFixed(1)}% {t('dash.vs_last_month')}
        </p>
      )}
    </div>
  );
}
