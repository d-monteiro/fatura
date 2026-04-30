// Recuperar fatura ignorada (deleted_at != null → review). Fonte da verdade: Supabase.
// O 23505 (unique violation) acontece se houver outra fatura activa com o mesmo
// attachment_hash; mensagem dedicada para o user perceber o que fazer.

import { supabase } from '@/lib/supabase/client';

// Vocabulário kind:detail consistente com supabase/functions/_shared/reviewReason.ts.
// Mantido em linha (sem partilhar entre browser e Deno) para evitar bundler config;
// a string tem que bater com `manual_request` no parser.
export const RECOVER_REVIEW_REASON = 'manual_request: Recuperada pelo utilizador';

export async function recoverInvoice(invoiceId: string): Promise<void> {
  const { error } = await supabase.from('invoices')
    .update({
      deleted_at: null,
      status: 'review',
      manual_review: true,
      review_reason: RECOVER_REVIEW_REASON,
    })
    .eq('id', invoiceId);

  if (!error) return;
  if (error.code === '23505') {
    throw new Error('Já existe outra fatura com este mesmo anexo. Remove a outra primeiro.');
  }
  throw error;
}
