import { useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import type { Invoice } from '@/types/database';

export function useBulkActions() {
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['faturas'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] });
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
      const { error } = await supabase
        .from('invoices')
        .update({ deleted_at: new Date().toISOString() })
        .in('id', ids);
      if (error) throw error;
    },
    onSuccess: invalidate,
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
