// Proxy para Edge Function analyze-document. A API key do OpenRouter só existe
// na Edge Function (Deno.env) — nunca é exposta ao browser.
import { geminiLimiter } from '@/lib/rateLimiter';
import { supabase } from '@/lib/supabase/client';
import type { GeminiInvoiceData } from '@/types/database';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const GEMINI_TIMEOUT_MS = 120_000;

const REJECTION_MESSAGES: Record<string, string> = {
  'pas_un_document': 'Isto não é uma fatura ou documento financeiro. Por favor envie uma imagem de fatura, recibo ou nota de crédito.',
  'document_illisible': 'O documento está ilegível ou demasiado desfocado. Por favor envie uma imagem de melhor qualidade.',
  'pas_une_facture': 'Este documento não é uma fatura de despesa.',
};

function validateInvoice(inv: GeminiInvoiceData): void {
  if (!inv.is_valid_document) {
    const reason = inv.rejection_reason || 'pas_un_document';
    throw new Error(REJECTION_MESSAGES[reason] || REJECTION_MESSAGES['pas_un_document']);
  }
  if (!inv.supplier_name || !inv.doc_date || inv.montant_ttc === null) {
    throw new Error('Não foi possível extrair todos os dados. Verifique se a imagem está completa e legível.');
  }
}

export async function analyzeInvoiceWithGemini(
  fileData: string,
  mimeType: string,
  tenantId?: string | null,
): Promise<GeminiInvoiceData[]> {
  try {
    await geminiLimiter.waitForSlot();
    if (!SUPABASE_URL) throw new Error('VITE_SUPABASE_URL não configurada');

    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token ?? anonKey;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

    const response = await fetch(`${SUPABASE_URL}/functions/v1/analyze-document`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': anonKey,
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ data: fileData, mimeType, tenantId: tenantId ?? null }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
      throw new Error(errorData.error || `Erro do servidor: ${response.status}`);
    }

    const data = await response.json();

    // Edge Function may return { invoices: [...] } or a single object
    const invoices: GeminiInvoiceData[] = Array.isArray(data.invoices)
      ? data.invoices
      : [data as GeminiInvoiceData];

    invoices.forEach(validateInvoice);
    return invoices;
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `Falha na análise: ${error.message}`
        : 'Erro desconhecido ao processar'
    );
  }
}

export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const parts = result.split(',');
      if (parts.length < 2 || !parts[1]) {
        reject(new Error('Formato de ficheiro inválido'));
        return;
      }
      resolve(parts[1]);
    };
    reader.onerror = (error) => reject(error);
  });
}
