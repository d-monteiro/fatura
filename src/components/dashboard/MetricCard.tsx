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
  variant?: 'default' | 'gradient';
  onClick?: () => void;
}

export function MetricCard({
  title, value, icon: Icon, trend, color, variant = 'default', onClick,
}: MetricCardProps) {
  const { t } = useI18n();
  const trendPositive = trend !== null && trend !== undefined && trend >= 0;
  const isGradient = variant === 'gradient';

  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => { if (onClick && (e.key === 'Enter' || e.key === ' ')) onClick(); }}
      className={cn(
        'rounded-2xl border p-4 shadow-card transition-all duration-200 sm:p-6',
        isGradient
          ? 'gradient-primary border-transparent text-white'
          : 'border-gray-200/80 bg-white',
        onClick && 'cursor-pointer hover:shadow-card-hover hover:-translate-y-0.5 active:translate-y-0',
      )}
    >
      <div className="flex items-center justify-between">
        <p className={cn(
          'text-xs font-medium sm:text-sm',
          isGradient ? 'text-white/80' : 'text-gray-500',
        )}>{title}</p>
        <div className={cn(
          'rounded-xl p-2 sm:p-2.5',
          isGradient ? 'bg-white/15' : color,
        )}>
          <Icon className="h-4 w-4 text-white sm:h-5 sm:w-5" />
        </div>
      </div>
      <p className={cn(
        'mt-2 text-lg font-bold tracking-tight sm:mt-3 sm:text-2xl',
        isGradient ? 'text-white' : 'text-gray-900',
      )}>{formatEUR(value)}</p>
      {trend !== null && trend !== undefined && (
        <p className={cn(
          'mt-1 text-xs sm:text-sm',
          isGradient
            ? (trendPositive ? 'text-red-300' : 'text-green-300')
            : (trendPositive ? 'text-red-500' : 'text-green-600'),
        )}>
          {trendPositive ? '+' : ''}{trend.toFixed(1)}% {t('dash.vs_last_month')}
        </p>
      )}
    </div>
  );
}
