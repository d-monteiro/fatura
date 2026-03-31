import { useQuery } from '@tanstack/react-query';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { supabase } from '@/lib/supabase/client';
import { formatEUR } from '@/lib/utils/validation';
import { useI18n } from '@/contexts/I18nContext';

interface TrendChartProps {
  companyId: string | null;
}

export function TrendChart({ companyId }: TrendChartProps) {
  const { t } = useI18n();
  const { data: chartData = [] } = useQuery({
    queryKey: ['dashboard-trend', companyId],
    queryFn: async () => {
      let query = supabase
        .from('invoices')
        .select('doc_date, montant_ttc')
        .is('deleted_at', null)
        .not('doc_date', 'is', null);

      if (companyId) {
        query = query.eq('company_id', companyId);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Aggregate by month
      const monthMap: Record<string, number> = {};
      for (const row of data ?? []) {
        if (!row.doc_date) continue;
        const key = row.doc_date.substring(0, 7); // "YYYY-MM"
        monthMap[key] = (monthMap[key] ?? 0) + (row.montant_ttc ?? 0);
      }

      return Object.entries(monthMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-12)
        .map(([key, total]) => {
          const monthNum = parseInt(key.split('-')[1]);
          return { month: t(`month_abbr.${monthNum}` as 'month_abbr.1'), total };
        });
    },
  });

  return (
    <div className="rounded-2xl border border-gray-200/80 bg-white p-4 shadow-card sm:p-6">
      <h3 className="mb-4 text-lg font-semibold text-gray-900">{t('dash.trends')}</h3>
      {chartData.length === 0 ? (
        <p className="py-16 text-center text-sm text-gray-400">{t('generic.no_data')}</p>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
            <YAxis
              tickFormatter={(v: number) => formatEUR(v)}
              tick={{ fontSize: 11 }}
              width={90}
            />
            <Tooltip
              formatter={(value) => [formatEUR(Number(value)), 'Total']}
              contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }}
            />
            <Area
              type="monotone"
              dataKey="total"
              stroke="#3b82f6"
              strokeWidth={2}
              fill="url(#colorTotal)"
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
