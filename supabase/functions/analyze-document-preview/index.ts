// ============================================
// Edge Function: analyze-document-preview
// Dry-run do prompt durante onboarding (sem persistir, sem tenant criado).
// Aceita config in-memory (sector, name variations, categorias) + ficheiro
// base64 e devolve a extracção do Gemini para o user validar antes de pagar.
// Deploy: supabase functions deploy analyze-document-preview
// Secrets: OPENROUTER_API_KEY
// ============================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { buildTenantPrompt, getVatRatesForCountry, type TenantAIConfig } from "../_shared/promptBuilder.ts";
import { getCorsHeaders, getFrontendUrl } from "../_shared/cors.ts";
import { logEdgeError } from "../_shared/logError.ts";

const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY")!;
const API_TIMEOUT_MS = 120_000;
const MAX_BASE64_LEN = 8_000_000;
const ALLOWED_MIMES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
]);

// Cap de previews por user para evitar abuso (cobra Gemini sem retorno).
const MAX_PREVIEWS_PER_USER_PER_DAY = 10;

function json(status: number, body: unknown, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timeoutId));
}

function tryParseJSON(text: string): unknown {
  try { return JSON.parse(text); } catch { /* continue */ }
  let fixed = text;
  const lastBrace = fixed.lastIndexOf("}");
  if (lastBrace > 0) {
    fixed = fixed.substring(0, lastBrace + 1);
    const openBrackets = (fixed.match(/\[/g) || []).length - (fixed.match(/\]/g) || []).length;
    const openBraces = (fixed.match(/\{/g) || []).length - (fixed.match(/\}/g) || []).length;
    fixed += "]".repeat(Math.max(0, openBrackets)) + "}".repeat(Math.max(0, openBraces));
    try { return JSON.parse(fixed); } catch { /* continue */ }
  }
  throw new Error("Could not parse Gemini response as JSON");
}

interface PreviewBody {
  data: string;
  mimeType: string;
  config: {
    companyName: string;
    nif?: string;
    sector?: string;
    country?: string;
    currency?: string;
    nameVariations?: string[];
    categories?: string[];
    documentTypes?: string[];
  };
}

function buildConfigFromBody(c: PreviewBody["config"]): TenantAIConfig {
  const country = (c.country ?? "PT").toUpperCase();
  const variations = (c.nameVariations ?? []).map((v) => v.trim()).filter(Boolean);
  const companyName = c.companyName?.trim() || "A sua empresa";
  return {
    companies: [{
      name: companyName,
      nif: (c.nif ?? "").trim(),
      nameVariations: variations.length ? variations : [companyName.toUpperCase()],
    }],
    sector: c.sector?.trim() || "geral",
    country,
    currency: c.currency?.trim() || "EUR",
    vatRates: getVatRatesForCountry(country),
    categories: (c.categories ?? []).map((label, i) => ({
      code: label.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || `cat_${i}`,
      label,
    })),
    knownSuppliers: [],
    documentTypes: (c.documentTypes ?? []).filter(Boolean).length
      ? c.documentTypes!.filter(Boolean)
      : ["fatura", "recibo"],
  };
}

async function checkPreviewQuota(
  admin: ReturnType<typeof createClient>,
  userId: string,
): Promise<{ ok: true } | { ok: false; used: number }> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from("edge_rate_limits")
    .select("*", { count: "exact", head: true })
    .eq("endpoint", "analyze-document-preview")
    .eq("client_id", userId)
    .gte("created_at", since);
  const used = count ?? 0;
  if (used >= MAX_PREVIEWS_PER_USER_PER_DAY) return { ok: false, used };
  return { ok: true };
}

async function recordPreviewUse(admin: ReturnType<typeof createClient>, userId: string) {
  await admin.from("edge_rate_limits").insert({
    endpoint: "analyze-document-preview",
    client_id: userId,
  });
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" }, corsHeaders);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { error: "Unauthorized" }, corsHeaders);
    const userClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json(401, { error: "Unauthorized" }, corsHeaders);

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const quota = await checkPreviewQuota(admin, user.id);
    if (!quota.ok) {
      return json(429, {
        error: "Limite diário de previews atingido.",
        code: "preview_quota_exceeded",
        limit: MAX_PREVIEWS_PER_USER_PER_DAY,
        used: quota.used,
      }, corsHeaders);
    }

    const body = await req.json() as PreviewBody;
    if (typeof body?.data !== "string" || !body.data || body.data.length > MAX_BASE64_LEN) {
      return json(400, { error: "data inválido ou demasiado grande" }, corsHeaders);
    }
    if (typeof body.mimeType !== "string" || !ALLOWED_MIMES.has(body.mimeType.toLowerCase())) {
      return json(400, { error: "mimeType não suportado" }, corsHeaders);
    }
    if (!body.config || typeof body.config.companyName !== "string") {
      return json(400, { error: "config inválido" }, corsHeaders);
    }

    const cfg = buildConfigFromBody(body.config);
    const prompt = buildTenantPrompt(cfg);

    const response = await fetchWithTimeout(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
          "HTTP-Referer": getFrontendUrl(),
          "X-Title": "FaturaAI Preview",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [{
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: `data:${body.mimeType};base64,${body.data}` } },
              { type: "text", text: "Analisa este documento e devolve o JSON conforme o formato. Se houver várias faturas, extrai todas." },
            ],
          }],
          max_tokens: 16384,
          temperature: 0.1,
        }),
      },
      API_TIMEOUT_MS,
    );

    if (!response.ok) {
      return json(502, { error: `OpenRouter API error: ${response.status}` }, corsHeaders);
    }

    const result = await response.json();
    const text = result.choices?.[0]?.message?.content || "";
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    let parsed: unknown;
    try {
      parsed = tryParseJSON(cleaned);
    } catch (e) {
      return json(502, { error: e instanceof Error ? e.message : "JSON parse falhou" }, corsHeaders);
    }

    await recordPreviewUse(admin, user.id);

    const invoices = (parsed && typeof parsed === "object" && "invoices" in parsed
      && Array.isArray((parsed as Record<string, unknown>).invoices))
      ? (parsed as { invoices: unknown[] }).invoices
      : [parsed];

    return json(200, { invoices }, corsHeaders);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logEdgeError({
      functionName: "analyze-document-preview",
      message: msg,
      error,
      httpMethod: req.method,
      httpPath: new URL(req.url).pathname,
      httpStatus: 500,
    });
    return json(500, { error: msg }, corsHeaders);
  }
});
