/**
 * FaturaAI - Tenant-aware document analyzer
 * Wraps the existing gemini.ts with tenant context.
 */

import { analyzeInvoiceWithGemini } from '@/lib/gemini';
import type { GeminiInvoiceData } from '@/types/database';

export interface AnalyzeOptions {
  tenantId: string;
  companyId: string;
}

/**
 * Analyze a document using the tenant-configured AI.
 * Currently delegates to the existing Gemini analyzer.
 * The Edge Function will use the tenant's prompt config from the DB.
 */
export async function analyzeDocument(
  fileData: string,
  mimeType: string,
  _options: AnalyzeOptions,
): Promise<GeminiInvoiceData[]> {
  // The Edge Function (analyze-document) will be updated to read
  // tenant.ai_prompt_config and build a tenant-specific prompt.
  // For now, delegate to the existing analyzer.
  return analyzeInvoiceWithGemini(fileData, mimeType);
}
