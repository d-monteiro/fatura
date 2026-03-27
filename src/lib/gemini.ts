/**
 * Client frontend pour Edge Function analyze-document (Gemini 2.5 Pro)
 * API key JAMAIS dans le frontend — uniquement dans l'Edge Function.
 */

import { geminiLimiter } from '@/lib/rateLimiter';
import type { GeminiInvoiceData } from '@/types/database';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const GEMINI_TIMEOUT_MS = 120_000;

export async function analyzeInvoiceWithGemini(
  fileData: string,
  mimeType: string,
): Promise<GeminiInvoiceData> {
  try {
    await geminiLimiter.waitForSlot();

    if (!SUPABASE_URL) throw new Error('VITE_SUPABASE_URL non configurée');

    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

    const response = await fetch(`${SUPABASE_URL}/functions/v1/analyze-document`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': anonKey,
        'Authorization': `Bearer ${anonKey}`,
      },
      body: JSON.stringify({ data: fileData, mimeType }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
      throw new Error(errorData.error || `Erreur serveur: ${response.status}`);
    }

    const data: GeminiInvoiceData = await response.json();

    if (!data.is_valid_document) {
      const messages: Record<string, string> = {
        'pas_un_document': "Ce n'est pas une facture ou document financier. Veuillez envoyer une image de facture, reçu ou avoir.",
        'document_illisible': 'Le document est illisible ou trop flou. Veuillez envoyer une image de meilleure qualité.',
        'pas_une_facture': "Ce document n'est pas une facture de dépense.",
      };
      const reason = data.rejection_reason || 'pas_un_document';
      throw new Error(messages[reason] || messages['pas_un_document']);
    }

    if (!data.supplier_name || !data.doc_date || data.montant_ttc === null) {
      throw new Error("Impossible d'extraire toutes les données. Vérifiez que l'image est complète et lisible.");
    }

    return data;
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `Échec de l'analyse: ${error.message}`
        : 'Erreur inconnue lors du traitement'
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
        reject(new Error('Format de fichier invalide'));
        return;
      }
      resolve(parts[1]);
    };
    reader.onerror = (error) => reject(error);
  });
}
