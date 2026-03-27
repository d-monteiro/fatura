import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { useI18n } from '@/contexts/I18nContext';
import { Inbox as InboxIcon } from 'lucide-react';
import { useCompanyFilter } from '@/hooks/useCompanyFilter';
import { InboxCard } from '@/components/inbox/InboxCard';
import type { Invoice } from '@/types/database';

export default function Inbox() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { companyId } = useCompanyFilter();

  const { data: invoices, isLoading } = useQuery({
    queryKey: ['inbox-invoices', companyId],
    queryFn: async () => {
      let query = supabase
        .from('invoices')
        .select('*')
        .in('status', ['inbox', 'review'])
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (companyId) {
        query = query.eq('company_id', companyId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Invoice[];
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from('invoices')
        .update({ status, manual_review: false })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inbox-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] });
      queryClient.invalidateQueries({ queryKey: ['recent-invoices'] });
    },
  });

  const handleApprove = (id: string) => {
    updateStatus.mutate({ id, status: 'processed' });
  };

  const handleEdit = (id: string) => {
    // TODO: Open edit modal/drawer for invoice
    console.log('Edit invoice:', id);
  };

  const handleReject = (id: string) => {
    updateStatus.mutate({ id, status: 'pending' });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">{t('inbox.title')}</h1>
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-36 animate-pulse rounded-2xl bg-gray-100" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{t('inbox.title')}</h1>
        {invoices && invoices.length > 0 && (
          <span className="rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-700">
            {invoices.length}
          </span>
        )}
      </div>

      {(!invoices || invoices.length === 0) ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 py-16">
          <InboxIcon className="h-12 w-12 text-gray-300" />
          <p className="mt-4 text-gray-500">{t('inbox.empty')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {invoices.map((inv) => (
            <InboxCard
              key={inv.id}
              invoice={inv}
              onApprove={handleApprove}
              onEdit={handleEdit}
              onReject={handleReject}
            />
          ))}
        </div>
      )}
    </div>
  );
}
