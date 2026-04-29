import { supabase } from '@/lib/supabase/client';
import type { GeminiInvoiceData } from '@/types/database';

interface AttachmentDuplicate {
  doc_number: string | null;
  doc_date: string | null;
  supplier_name: string | null;
  valor_total: number | null;
}

export async function computeFileHash(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function findByAttachmentHash(tenantId: string, hash: string): Promise<AttachmentDuplicate | null> {
  const { data } = await supabase.from('invoices')
    .select('doc_number, doc_date, supplier_name, valor_total')
    .eq('tenant_id', tenantId).eq('attachment_hash', hash)
    .is('deleted_at', null).limit(1).maybeSingle();
  return (data as AttachmentDuplicate | null) ?? null;
}

export function formatDuplicateMessage(d: AttachmentDuplicate): string {
  const parts = [d.supplier_name, d.doc_date, d.valor_total != null ? `${d.valor_total.toFixed(2)} €` : null]
    .filter(Boolean);
  const label = parts.length ? ` (${parts.join(' · ')})` : '';
  return `Anexo já processado${label}. Fatura existente não foi reprocessada.`;
}

export async function checkDuplicate(tenantId: string, g: GeminiInvoiceData, cid: string): Promise<string | null> {
  const label = `${g.supplier_name} - ${g.doc_date} (${g.valor_total?.toFixed(2)} €)`;
  if (g.doc_number) {
    const { data } = await supabase.from('invoices').select('id')
      .eq('tenant_id', tenantId).eq('company_id', cid)
      .ilike('doc_number', g.doc_number).is('deleted_at', null).limit(1);
    if (data?.length) return `Fatura duplicada: ${label} | Doc: ${g.doc_number}`;
  } else {
    const { data } = await supabase.from('invoices').select('id, summary')
      .eq('tenant_id', tenantId).eq('company_id', cid)
      .ilike('supplier_name', g.supplier_name || '').eq('doc_date', g.doc_date)
      .eq('valor_total', g.valor_total).is('deleted_at', null).limit(5);
    if (data?.some((d) => ((d.summary as string) || '').toLowerCase().trim() === (g.summary || '').toLowerCase().trim())) {
      return `Fatura duplicada: ${label}`;
    }
  }
  return null;
}
