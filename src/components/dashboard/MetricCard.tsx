import type { LucideIcon } from 'lucide-react';
import { formatEUR } from '@/lib/utils/validation';
import { useI18n } from '@/contexts/I18nContext';
import { cn } from '@/lib/cn';

interface MetricCardProps {
  title: string;
  value: number | null;
  icon: LucideIcon;
  trend?: number | null;
  color: string;
  onClick?: () => void;
}

export function MetricCard({ title, value, icon: Icon, trend, color, onClick }: MetricCardProps) {
  const { t } = useI18n();
  const trendPositive = trend !== null && trend !== undefined && trend >= 0;

  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => { if (onClick && (e.key === 'Enter' || e.key === ' ')) onClick(); }}
      className={cn(
        'rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6',
        onClick && 'cursor-pointer transition-shadow hover:shadow-md active:shadow-sm',
      )}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-gray-500 sm:text-sm">{title}</p>
        <div className={`rounded-xl p-2 sm:p-2.5 ${color}`}>
          <Icon className="h-4 w-4 text-white sm:h-5 sm:w-5" />
        </div>
      </div>
      <p className="mt-2 text-lg font-bold text-gray-900 sm:mt-3 sm:text-2xl">{formatEUR(value)}</p>
      {trend !== null && trend !== undefined && (
        <p className={`mt-1 text-xs sm:text-sm ${trendPositive ? 'text-red-500' : 'text-green-600'}`}>
          {trendPositive ? '+' : ''}{trend.toFixed(1)}% {t('dash.vs_last_month')}
        </p>
      )}
    </div>
  );
}
