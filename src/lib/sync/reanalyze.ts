// Re-tentar análise de uma fatura específica.
// Reset (status, drive_file_id, review_reason) + chamada a reprocess-pending
// é feito server-side para evitar race com analyze-document a meio.

import { supabase } from '@/lib/supabase/client';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export interface ReanalyzeResult {
  ok: boolean;
  error?: string;
  stage?: string;
}

export async function reanalyzeInvoice(invoiceId: string): Promise<ReanalyzeResult> {
  if (!SUPABASE_URL) return { ok: false, error: 'VITE_SUPABASE_URL em falta' };

  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
  const { data: { session } } = await supabase.auth.getSession();
  const accessToken = session?.access_token;
  if (!accessToken) return { ok: false, error: 'Sessão expirada' };

  const resp = await fetch(`${SUPABASE_URL}/functions/v1/reprocess-pending`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ invoice_ids: [invoiceId] }),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => `HTTP ${resp.status}`);
    return { ok: false, error: text.slice(0, 200) };
  }
  const payload = await resp.json().catch(() => ({}));
  const r = payload?.results?.[0];
  if (!r) return { ok: false, error: 'Sem resultado da Edge Function' };
  return r.ok
    ? { ok: true, stage: r.stage }
    : { ok: false, error: r.reason || r.stage || 'Falhou', stage: r.stage };
}
