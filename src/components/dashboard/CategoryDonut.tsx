import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { supabase } from '@/lib/supabase/client';
import { formatEUR } from '@/lib/utils/validation';
import { useI18n } from '@/contexts/I18nContext';

const COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4', '#f59e0b', '#ef4444', '#10b981', '#6b7280'];

const NATURE_LABELS: Record<string, string> = {
  materiaux: 'Materiaux',
  sous_traitants: 'Sous-traitants',
  location_materiel: 'Location materiel',
  restauration: 'Restauration',
  carburant: 'Carburant',
  atelier: 'Atelier',
  assurances: 'Assurances',
  comptabilite: 'Comptabilite',
  fournitures_bureau: 'Fournitures bureau',
  autre: 'Autre',
};

// Reverse lookup: label -> db key
const LABEL_TO_KEY: Record<string, string> = {};
for (const [key, label] of Object.entries(NATURE_LABELS)) {
  LABEL_TO_KEY[label] = key;
}

interface CategoryDonutProps {
  companyId: string | null;
}

export function CategoryDonut({ companyId }: CategoryDonutProps) {
  const { t } = useI18n();
  const navigate = useNavigate();

  const { data: chartData = [] } = useQuery({
    queryKey: ['dashboard-categories', companyId],
    queryFn: async () => {
      let query = supabase
        .from('invoices')
        .select('nature_depense, montant_ttc')
        .is('deleted_at', null);

      if (companyId) {
        query = query.eq('company_id', companyId);
      }

      const { data, error } = await query;
      if (error) throw error;

      const map: Record<string, number> = {};
      for (const row of data ?? []) {
        const key = row.nature_depense ?? 'autre';
        map[key] = (map[key] ?? 0) + (row.montant_ttc ?? 0);
      }

      return Object.entries(map)
        .filter(([, value]) => value > 0)
        .sort(([, a], [, b]) => b - a)
        .map(([name, value], i) => ({
          name: NATURE_LABELS[name] ?? name,
          value,
          color: COLORS[i % COLORS.length],
        }));
    },
  });

  const handleSliceClick = (_: unknown, index: number) => {
    const entry = chartData[index];
    if (!entry) return;
    const dbKey = LABEL_TO_KEY[entry.name] ?? entry.name;
    navigate(`/invoices?nature=${dbKey}`);
  };

  return (
    <div className="rounded-2xl border border-gray-200/80 bg-white p-4 shadow-card sm:p-6">
      <h3 className="mb-4 text-lg font-semibold text-gray-900">{t('dash.categories')}</h3>
      {chartData.length === 0 ? (
        <p className="py-16 text-center text-sm text-gray-400">Aucune donnee</p>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={100}
              paddingAngle={3}
              dataKey="value"
              onClick={handleSliceClick}
              className="cursor-pointer"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value) => formatEUR(Number(value))}
              contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }}
            />
            <Legend
              formatter={(value: string) => (
                <span className="text-sm text-gray-600">{value}</span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
