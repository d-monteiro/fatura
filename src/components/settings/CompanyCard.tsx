import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { Pencil, Trash2 } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import type { Company } from '@/types/database';
import { queryKeys } from '@/lib/queryKeys';
import { CompanyEditForm } from './CompanyEditForm';
import { CompanyEmailAccounts } from './CompanyEmailAccounts';

export function CompanyCard({ company: c }: { company: Company }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);

  const del = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('companies').update({ is_active: false }).eq('id', c.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.companies }),
  });

  if (editing) return <CompanyEditForm company={c} onDone={() => setEditing(false)} />;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-card">
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-900">{c.name}</p>
          {c.nif && <p className="mt-1 text-xs text-gray-500">NIF: {c.nif}</p>}
          {c.email && <p className="mt-0.5 text-xs text-gray-500">{c.email}</p>}
          {c.address && <p className="mt-0.5 text-xs text-gray-400">{c.address}</p>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => setEditing(true)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600" title={t('sup.edit')}><Pencil className="h-4 w-4" /></button>
          <button onClick={() => { if (confirm(`Eliminar "${c.name}"?`)) del.mutate(); }} className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600" title={t('action.delete')}><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>

      <CompanyEmailAccounts companyId={c.id} />
    </div>
  );
}
