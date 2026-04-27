// Marcar fatura como paga / reverter. Fonte da verdade: Supabase.
// Não toca no Sheets em V1 — a coluna "Paid" não está no layout actual das abas.

import { supabase } from '@/lib/supabase/client';

export async function setInvoicePaid(invoiceId: string, paid: boolean): Promise<void> {
  const { error } = await supabase.from('invoices')
    .update({ paid_at: paid ? new Date().toISOString() : null })
    .eq('id', invoiceId);
  if (error) throw error;
}
