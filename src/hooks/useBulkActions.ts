import { useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/client';
import { invalidateInvoiceLists } from '@/lib/queryKeys';
import { reportError } from '@/lib/errors/errorReporter';
import type { Invoice } from '@/types/database';

export function useBulkActions() {
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const invalidate = useCallback(() => {
    invalidateInvoiceLists(queryClient);
    setSelectedIds(new Set());
  }, [queryClient]);

  const bulkApprove = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from('invoices')
        .update({ status: 'processed', manual_review: false })
        .in('id', ids);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const bulkDelete = useMutation({
    mutationFn: async (ids: string[]) => {
      const { data, error } = await supabase
        .from('invoices')
        .update({ deleted_at: new Date().toISOString() })
        .in('id', ids)
        .is('deleted_at', null)
        .select('id');
      if (error) throw error;
      return data?.length ?? 0;
    },
    onSuccess: (count) => {
      invalidate();
      toast.success(`${count} fatura(s) eliminada(s)`);
    },
    onError: (err) => {
      void reportError(err, { component: 'useBulkActions.bulkDelete' });
      toast.error(err instanceof Error ? err.message : 'Erro a eliminar faturas');
    },
  });

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback((invoices: Invoice[]) => {
    const allSelected = invoices.length > 0 && invoices.every((inv) => selectedIds.has(inv.id));
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(invoices.map((inv) => inv.id)));
    }
  }, [selectedIds]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  return {
    selectedIds,
    toggleSelect,
    toggleAll,
    clearSelection,
    bulkApprove,
    bulkDelete,
    bulkLoading: bulkApprove.isPending || bulkDelete.isPending,
  };
}
