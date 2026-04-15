// ============================================
// Edge Function: analyze-document
// OpenRouter → Gemini 2.5 Pro — Tenant-aware multi-invoice extraction
// Deploy: supabase functions deploy analyze-document
// Secret: OPENROUTER_API_KEY
// ============================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { buildTenantPrompt, getVatRatesForCountry, type TenantAIConfig } from "../_shared/promptBuilder.ts";
import { getCorsHeaders, getFrontendUrl } from "../_shared/cors.ts";

const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY")!;
const API_TIMEOUT_MS = 120_000;

function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timeoutId));
}

function tryParseJSON(text: string): unknown {
  try { return JSON.parse(text); } catch { /* continue */ }
  let fixed = text;
  const lastBrace = fixed.lastIndexOf('}');
  if (lastBrace > 0) {
    fixed = fixed.substring(0, lastBrace + 1);
    const openBrackets = (fixed.match(/\[/g) || []).length - (fixed.match(/\]/g) || []).length;
    const openBraces = (fixed.match(/\{/g) || []).length - (fixed.match(/\}/g) || []).length;
    fixed += ']'.repeat(Math.max(0, openBrackets)) + '}'.repeat(Math.max(0, openBraces));
    try { return JSON.parse(fixed); } catch { /* continue */ }
  }
  const lineItemsIdx = text.indexOf('"line_items"');
  if (lineItemsIdx > 0) {
    const before = text.substring(0, lineItemsIdx) + '"line_items": []}';
    const invoicesClose = before.includes('"invoices"') ? ']}' : '}';
    try { return JSON.parse(before); } catch { /* continue */ }
    try { return JSON.parse(before + invoicesClose); } catch { /* continue */ }
  }
  throw new Error("Could not parse Gemini response as JSON");
}

function normalizeResult(parsed: unknown): { invoices: unknown[] } {
  if (parsed && typeof parsed === 'object') {
    if ('invoices' in parsed && Array.isArray((parsed as Record<string, unknown>).invoices)) {
      return parsed as { invoices: unknown[] };
    }
    if ('is_valid_document' in parsed) return { invoices: [parsed] };
    if (Array.isArray(parsed)) return { invoices: parsed };
  }
  return { invoices: [parsed] };
}

interface OnboardingData {
  categories?: string[];
  topSuppliers?: string[];
  documentTypes?: string[];
}

async function loadTenantConfig(supabase: ReturnType<typeof createClient>, tenantId: string): Promise<TenantAIConfig | null> {
  const { data: tenant } = await supabase.from("tenants")
    .select("name, nif, sector, country, language, currency, invoice_name_variations, onboarding_data")
    .eq("id", tenantId).is("deleted_at", null).single();
  if (!tenant) return null;

  const { data: cats } = await supabase.from("categories")
    .select("axis, code, label, sort_order")
    .eq("tenant_id", tenantId).eq("is_active", true).order("sort_order");

  const { data: suppliers } = await supabase.from("suppliers")
    .select("name, name_variations").eq("tenant_id", tenantId).limit(100);

  const ob = (tenant.onboarding_data ?? {}) as OnboardingData;
  const language = (tenant.language as 'pt' | 'fr' | 'en') ?? 'pt';

  const costTypes = (cats ?? []).filter((c) => c.axis === 'cost_type')
    .map((c) => ({ code: c.code as string, label: c.label as string }));
  const metiers = (cats ?? []).filter((c) => c.axis === 'metier')
    .map((c) => ({ code: c.code as string, label: c.label as string }));
  const natures = (cats ?? []).filter((c) => c.axis === 'nature_depense')
    .map((c) => ({ code: c.code as string, label: c.label as string }));

  // Fallback: se nenhuma categoria está seedada, usar topSuppliers/categories do onboarding como labels brutas
  if (costTypes.length === 0) {
    costTypes.push({ code: 'cout_fixe', label: 'Custos fixos' }, { code: 'cout_variable', label: 'Custos variáveis' });
  }
  if (natures.length === 0 && Array.isArray(ob.categories)) {
    ob.categories.forEach((cat, i) => natures.push({
      code: cat.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || `nat_${i}`,
      label: cat,
    }));
  }

  const knownSuppliers = (suppliers ?? []).map((s) => ({
    normalized: s.name as string,
    variations: ((s.name_variations as string[]) ?? []).concat([s.name as string]),
  }));
  // Topar com topSuppliers do onboarding caso suppliers ainda esteja vazia
  if (knownSuppliers.length === 0 && Array.isArray(ob.topSuppliers)) {
    ob.topSuppliers.forEach((s) => knownSuppliers.push({ normalized: s.toUpperCase(), variations: [s] }));
  }

  return {
    companyName: tenant.name as string,
    nif: (tenant.nif as string) ?? '',
    sector: (tenant.sector as string) ?? 'geral',
    language,
    country: (tenant.country as string) ?? 'PT',
    currency: (tenant.currency as string) ?? 'EUR',
    nameVariations: ((tenant.invoice_name_variations as string[]) ?? []).length
      ? (tenant.invoice_name_variations as string[])
      : [(tenant.name as string).toUpperCase()],
    vatRates: getVatRatesForCountry((tenant.country as string) ?? 'PT'),
    costTypes,
    metiers,
    natures,
    knownSuppliers,
    documentTypes: Array.isArray(ob.documentTypes) && ob.documentTypes.length
      ? ob.documentTypes : ['factures', 'recus'],
  };
}

const FALLBACK_PROMPT = `# RÔLE
Tu es un comptable senior. Analyse cette facture et renvoie un JSON structuré.

# FORMAT DE SORTIE (JSON UNIQUEMENT)
{ "invoices": [{ "is_valid_document": boolean, "rejection_reason": string|null, "document_type": string|null, "cost_type": string|null, "metier": string|null, "nature_depense": string|null, "doc_year": number|null, "doc_date": string|null, "date_echeance": string|null, "supplier_name": string|null, "destinataire_name": string|null, "supplier_nif": string|null, "doc_number": string|null, "montant_ht": number|null, "taux_tva": number|null, "montant_tva": number|null, "montant_ttc": number|null, "autoliquidation": boolean, "payment_method": string|null, "supplier_iban": string|null, "summary": string|null, "confidence_score": number, "line_items": [] }] }`;

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (authHeader && supabaseUrl && supabaseAnonKey) {
      const userClient = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false },
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const { data, mimeType, tenantId } = await req.json();

    if (!data || !mimeType) {
      return new Response(JSON.stringify({ error: "data and mimeType are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build prompt: tenant-aware se possível, senão fallback
    let prompt = FALLBACK_PROMPT;
    if (tenantId && supabaseUrl && serviceKey) {
      const adminClient = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
      const cfg = await loadTenantConfig(adminClient, tenantId);
      if (cfg) prompt = buildTenantPrompt(cfg);
    }

    const response = await fetchWithTimeout(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
          "HTTP-Referer": getFrontendUrl(),
          "X-Title": "FaturaAI",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-pro",
          messages: [{
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: `data:${mimeType};base64,${data}` } },
              { type: "text", text: "Analisa este documento e devolve o JSON conforme o formato. Se houver várias faturas, extrai todas." },
            ],
          }],
          max_tokens: 16384,
          temperature: 0.1,
        }),
      },
      API_TIMEOUT_MS
    );

    if (!response.ok) {
      const errorText = await response.text();
      return new Response(JSON.stringify({ error: "OpenRouter API error: " + response.status, details: errorText }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await response.json();
    const text = result.choices?.[0]?.message?.content || "";
    const cleanedText = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    const parsed = tryParseJSON(cleanedText);
    const normalized = normalizeResult(parsed);

    return new Response(JSON.stringify(normalized), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
