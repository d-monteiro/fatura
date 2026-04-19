// ============================================
// Edge Function: analyze-document
// OpenRouter → Gemini 2.5 Pro — Tenant-aware multi-invoice extraction
// Deploy: supabase functions deploy analyze-document
// Secrets: OPENROUTER_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY,
//          SUPABASE_SERVICE_ROLE_KEY
// ============================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { buildTenantPrompt, getVatRatesForCountry, type TenantAIConfig } from "../_shared/promptBuilder.ts";
import { getCorsHeaders, getFrontendUrl } from "../_shared/cors.ts";
import { logEdgeError } from "../_shared/logError.ts";
import { finalizeInvoice } from "../_shared/finalizeInvoice.ts";

const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY")!;
const API_TIMEOUT_MS = 120_000;
const MAX_BASE64_LEN = 8_000_000; // ~6MB binary
const ALLOWED_MIMES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
]);

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
  const lineItemsIdx = text.indexOf('"line_items"');
  if (lineItemsIdx > 0) {
    const before = text.substring(0, lineItemsIdx) + '"line_items": []}';
    const invoicesClose = before.includes('"invoices"') ? "]}" : "}";
    try { return JSON.parse(before); } catch { /* continue */ }
    try { return JSON.parse(before + invoicesClose); } catch { /* continue */ }
  }
  throw new Error("Could not parse Gemini response as JSON");
}

function normalizeResult(parsed: unknown): { invoices: unknown[] } {
  if (parsed && typeof parsed === "object") {
    if ("invoices" in parsed && Array.isArray((parsed as Record<string, unknown>).invoices)) {
      return parsed as { invoices: unknown[] };
    }
    if ("is_valid_document" in parsed) return { invoices: [parsed] };
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
  const language = (tenant.language as "pt" | "fr" | "en") ?? "pt";

  const costTypes = (cats ?? []).filter((c) => c.axis === "cost_type")
    .map((c) => ({ code: c.code as string, label: c.label as string }));
  const metiers = (cats ?? []).filter((c) => c.axis === "metier")
    .map((c) => ({ code: c.code as string, label: c.label as string }));
  const natures = (cats ?? []).filter((c) => c.axis === "nature_depense")
    .map((c) => ({ code: c.code as string, label: c.label as string }));

  if (costTypes.length === 0) {
    costTypes.push({ code: "cout_fixe", label: "Custos fixos" }, { code: "cout_variable", label: "Custos variáveis" });
  }
  if (natures.length === 0 && Array.isArray(ob.categories)) {
    ob.categories.forEach((cat, i) => natures.push({
      code: cat.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || `nat_${i}`,
      label: cat,
    }));
  }

  const knownSuppliers = (suppliers ?? []).map((s) => ({
    normalized: s.name as string,
    variations: ((s.name_variations as string[]) ?? []).concat([s.name as string]),
  }));
  if (knownSuppliers.length === 0 && Array.isArray(ob.topSuppliers)) {
    ob.topSuppliers.forEach((s) => knownSuppliers.push({ normalized: s.toUpperCase(), variations: [s] }));
  }

  return {
    companyName: tenant.name as string,
    nif: (tenant.nif as string) ?? "",
    sector: (tenant.sector as string) ?? "geral",
    language,
    country: (tenant.country as string) ?? "PT",
    currency: (tenant.currency as string) ?? "EUR",
    nameVariations: ((tenant.invoice_name_variations as string[]) ?? []).length
      ? (tenant.invoice_name_variations as string[])
      : [(tenant.name as string).toUpperCase()],
    vatRates: getVatRatesForCountry((tenant.country as string) ?? "PT"),
    costTypes,
    metiers,
    natures,
    knownSuppliers,
    documentTypes: Array.isArray(ob.documentTypes) && ob.documentTypes.length
      ? ob.documentTypes : ["factures", "recus"],
  };
}

const REJECTION_LABELS_PT: Record<string, string> = {
  pas_un_document: "Não é um documento",
  document_illisible: "Documento ilegível",
  pas_une_facture: "Não é uma fatura",
  pas_une_facture_fournisseur: "Fatura emitida pela própria empresa",
};

function rejectionToPt(reason: unknown): string {
  if (typeof reason !== "string" || !reason) return "Documento não validado";
  return REJECTION_LABELS_PT[reason] ?? reason;
}

const FALLBACK_PROMPT = `# RÔLE
Tu es un comptable senior. Analyse cette facture et renvoie un JSON structuré.

# FORMAT DE SORTIE (JSON UNIQUEMENT)
{ "invoices": [{ "is_valid_document": boolean, "rejection_reason": string|null, "document_type": string|null, "cost_type": string|null, "metier": string|null, "nature_depense": string|null, "doc_year": number|null, "doc_date": string|null, "date_echeance": string|null, "supplier_name": string|null, "destinataire_name": string|null, "supplier_nif": string|null, "doc_number": string|null, "montant_ht": number|null, "taux_tva": number|null, "montant_tva": number|null, "montant_ttc": number|null, "autoliquidation": boolean, "payment_method": string|null, "supplier_iban": string|null, "summary": string|null, "confidence_score": number, "line_items": [] }] }`;

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" }, corsHeaders);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Chamadas internas (sync-email) enviam x-internal-secret = service role key
    const internalSecret = req.headers.get("x-internal-secret");
    const isInternal = !!internalSecret && !!serviceKey && internalSecret === serviceKey;

    let validatedUserId: string | null = null;

    if (!isInternal) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return json(401, { error: "Unauthorized" }, corsHeaders);

      const userClient = createClient(supabaseUrl, anonKey, {
        auth: { persistSession: false },
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) return json(401, { error: "Unauthorized" }, corsHeaders);
      validatedUserId = user.id;
    }

    const body = await req.json();
    const adminClient = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // Modo interno "by invoice": carrega stub + storage, corre Gemini, persiste e sai.
    // skip_finalize=true: chamador faz Drive+Sheets em batch (sync-email)
    if (isInternal && typeof body?.invoice_id === "string") {
      const skipFinalize = body?.skip_finalize === true;
      return await analyzeByInvoiceId(body.invoice_id, adminClient, corsHeaders, skipFinalize);
    }

    const { data, mimeType, tenantId } = body;

    if (typeof data !== "string" || !data || data.length > MAX_BASE64_LEN) {
      return json(400, { error: "data inválido ou demasiado grande" }, corsHeaders);
    }
    if (typeof mimeType !== "string" || !ALLOWED_MIMES.has(mimeType.toLowerCase())) {
      return json(400, { error: "mimeType não suportado" }, corsHeaders);
    }

    if (tenantId && !isInternal && validatedUserId) {
      const { data: membership } = await adminClient
        .from("tenant_users")
        .select("tenant_id")
        .eq("user_id", validatedUserId)
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .maybeSingle();
      if (!membership) return json(403, { error: "Tenant inacessível" }, corsHeaders);

      const limitCheck = await checkInvoiceLimit(adminClient, tenantId as string);
      if (!limitCheck.ok) {
        return json(402, {
          error: "Limite mensal de faturas atingido.",
          code: "invoice_limit_reached",
          limit: limitCheck.limit,
          used: limitCheck.used,
        }, corsHeaders);
      }
    }

    let prompt = FALLBACK_PROMPT;
    if (tenantId) {
      const cfg = await loadTenantConfig(adminClient, tenantId);
      if (cfg) prompt = buildTenantPrompt(cfg);
    }

    const geminiResult = await runGemini(prompt, data, mimeType);
    if (!geminiResult.ok) return json(geminiResult.status, { error: geminiResult.error }, corsHeaders);

    return json(200, geminiResult.normalized, corsHeaders);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logEdgeError({
      functionName: "analyze-document",
      message: msg,
      error,
      httpMethod: req.method,
      httpPath: new URL(req.url).pathname,
      httpStatus: 500,
    });
    return json(500, { error: msg }, corsHeaders);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Gemini call shared entre fluxo upload directo e fluxo by-invoice

type GeminiOutcome =
  | { ok: true; normalized: { invoices: unknown[] } }
  | { ok: false; status: number; error: string };

async function runGemini(prompt: string, base64Data: string, mimeType: string): Promise<GeminiOutcome> {
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
        model: "google/gemini-2.5-flash",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Data}` } },
            { type: "text", text: "Analisa este documento e devolve o JSON conforme o formato. Se houver várias faturas, extrai todas." },
          ],
        }],
        max_tokens: 16384,
        temperature: 0.1,
      }),
    },
    API_TIMEOUT_MS,
  );
  if (!response.ok) return { ok: false, status: 502, error: `OpenRouter API error: ${response.status}` };

  const result = await response.json();
  const text = result.choices?.[0]?.message?.content || "";
  const cleanedText = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  try {
    const parsed = tryParseJSON(cleanedText);
    return { ok: true, normalized: normalizeResult(parsed) };
  } catch (e) {
    return { ok: false, status: 502, error: e instanceof Error ? e.message : "JSON parse falhou" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Modo interno "by invoice": consumido por sync-email e pelo botão reprocessar.
// Carrega stub, baixa ficheiro do storage, corre Gemini e escreve a row.

async function analyzeByInvoiceId(
  invoiceId: string,
  adminClient: ReturnType<typeof createClient>,
  corsHeaders: Record<string, string>,
  skipFinalize = false,
): Promise<Response> {
  const { data: invoice, error: invErr } = await adminClient
    .from("invoices")
    .select("id, tenant_id, storage_path, email_message_id")
    .eq("id", invoiceId)
    .is("deleted_at", null)
    .maybeSingle();
  if (invErr || !invoice) {
    return json(404, { error: "Invoice não encontrada" }, corsHeaders);
  }
  if (!invoice.storage_path) {
    await markFailed(adminClient, invoiceId, "sem storage_path");
    return json(400, { error: "sem storage_path" }, corsHeaders);
  }

  const tenantId = invoice.tenant_id as string;

  // status analyzing durante a corrida — idempotente se já está analyzing
  await adminClient.from("invoices").update({
    status: "analyzing", review_reason: null,
  }).eq("id", invoiceId);

  const { data: file, error: dlErr } = await adminClient.storage
    .from("invoices").download(invoice.storage_path as string);
  if (dlErr || !file) {
    await markFailed(adminClient, invoiceId, `storage: ${dlErr?.message ?? "sem ficheiro"}`);
    return json(500, { error: "storage download falhou" }, corsHeaders);
  }
  const mime = (file.type || "application/pdf").toLowerCase();
  if (!ALLOWED_MIMES.has(mime)) {
    await markFailed(adminClient, invoiceId, `mime não suportado: ${mime}`);
    return json(400, { error: "mime não suportado" }, corsHeaders);
  }

  const buf = new Uint8Array(await file.arrayBuffer());
  const base64Data = uint8ToBase64(buf);
  if (base64Data.length > MAX_BASE64_LEN) {
    await markFailed(adminClient, invoiceId, "ficheiro > 6MB");
    return json(413, { error: "ficheiro demasiado grande" }, corsHeaders);
  }

  let prompt = FALLBACK_PROMPT;
  const cfg = await loadTenantConfig(adminClient, tenantId);
  if (cfg) prompt = buildTenantPrompt(cfg);

  const outcome = await runGemini(prompt, base64Data, mime);
  if (!outcome.ok) {
    await markFailed(adminClient, invoiceId, outcome.error);
    return json(outcome.status, { error: outcome.error }, corsHeaders);
  }

  const invoices = outcome.normalized.invoices;
  const first = (Array.isArray(invoices) && invoices[0]) as Record<string, unknown> | undefined;

  if (!first || first.is_valid_document === false) {
    // Gemini rejeitou (não é fatura / ilegível / fatura emitida pela empresa).
    // Soft-delete em vez de status=failed: sai do UI mas mantém attachment_hash
    // para dedup no próximo sync (senão pagamos Gemini outra vez pelo mesmo
    // PDF que acabámos de rejeitar).
    await rejectInvoice(
      adminClient,
      invoiceId,
      invoice.storage_path as string | null,
      rejectionToPt(first?.rejection_reason),
    );
    return json(200, { ok: true, state: "rejected" }, corsHeaders);
  }

  const confidence = (first.confidence_score as number | undefined) ?? 0;
  // Gemini devolve confidence em 0-1
  const needsReview = confidence < 0.8;

  const { error: updateErr } = await adminClient.from("invoices").update({
    document_type: first.document_type ?? null,
    cost_type: first.cost_type ?? null,
    metier: first.metier ?? null,
    nature_depense: first.nature_depense ?? null,
    doc_date: first.doc_date ?? null,
    doc_year: first.doc_year ?? null,
    date_echeance: first.date_echeance ?? null,
    supplier_name: typeof first.supplier_name === "string" ? (first.supplier_name as string).toUpperCase() : null,
    supplier_nif: first.supplier_nif ?? null,
    doc_number: first.doc_number ?? null,
    montant_ht: first.montant_ht ?? null,
    taux_tva: first.taux_tva ?? null,
    montant_tva: first.montant_tva ?? null,
    montant_ttc: first.montant_ttc ?? null,
    autoliquidation: (first.autoliquidation as boolean | undefined) ?? false,
    payment_method: first.payment_method ?? null,
    supplier_iban: first.supplier_iban ?? null,
    summary: first.summary ?? null,
    destinataire_name: (first.destinataire_name as string | undefined) ?? null,
    confidence_score: confidence,
    status: needsReview ? "review" : "inbox",
    manual_review: needsReview,
    review_reason: needsReview ? "Confiança baixa" : null,
  }).eq("id", invoiceId);

  if (updateErr) {
    await markFailed(adminClient, invoiceId, `update: ${updateErr.message?.slice(0, 120)}`);
    return json(500, { error: updateErr.message }, corsHeaders);
  }

  const lineItems = Array.isArray(first.line_items) ? first.line_items as Array<Record<string, unknown>> : [];
  if (lineItems.length) {
    await adminClient.from("invoice_line_items").insert(
      lineItems.map((li, idx) => ({
        tenant_id: tenantId,
        invoice_id: invoiceId,
        line_number: idx + 1,
        description: li.description ?? null,
        quantity: li.quantity ?? null,
        unit: li.unit ?? null,
        unit_price_ht: li.unit_price_ht ?? null,
        total_ht: li.total_ht ?? null,
        taux_tva: li.taux_tva ?? null,
      })),
    );
  }

  // Fase 2: Drive + Sheets + supplier match + dedup via finalizeInvoice.
  // sync-email passa skip_finalize=true e dispara reprocess-pending em batch
  // depois — evita N×Drive em paralelo a saturar quota.
  if (skipFinalize) {
    return json(200, {
      ok: true,
      state: needsReview ? "review" : "inbox",
      finalize_skipped: true,
    }, corsHeaders);
  }
  const finalizeResult = await finalizeInvoice(invoiceId, adminClient, {
    deleteStorageAfterDrive: true,
  });

  return json(200, {
    ok: true,
    state: needsReview ? "review" : "inbox",
    finalize: finalizeResult,
  }, corsHeaders);
}

async function markFailed(
  adminClient: ReturnType<typeof createClient>, invoiceId: string, reason: string,
) {
  await adminClient.from("invoices").update({
    status: "failed", manual_review: true, review_reason: reason.slice(0, 500),
  }).eq("id", invoiceId);
}

// Rejeição definitiva (Gemini decidiu que não é fatura processável).
// Soft-delete mantém o registo para dedup via attachment_hash mas remove
// do UI e liberta o bucket.
async function rejectInvoice(
  adminClient: ReturnType<typeof createClient>,
  invoiceId: string,
  storagePath: string | null,
  reason: string,
) {
  await adminClient.from("invoices").update({
    status: "failed",
    manual_review: false,
    review_reason: reason.slice(0, 500),
    deleted_at: new Date().toISOString(),
  }).eq("id", invoiceId);
  if (storagePath) {
    await adminClient.storage.from("invoices").remove([storagePath]);
  }
}

type LimitOutcome = { ok: true } | { ok: false; limit: number; used: number };

async function checkInvoiceLimit(
  adminClient: ReturnType<typeof createClient>,
  tenantId: string,
): Promise<LimitOutcome> {
  const { data: tenantRow } = await adminClient
    .from("tenants")
    .select("plan_id, invoices_month_reset")
    .eq("id", tenantId)
    .is("deleted_at", null)
    .maybeSingle();
  const planId = tenantRow?.plan_id as string | null | undefined;
  if (!planId) return { ok: true };

  const { data: planRow } = await adminClient
    .from("plans")
    .select("max_invoices_month")
    .eq("id", planId)
    .maybeSingle();
  const limit = planRow?.max_invoices_month as number | null | undefined;
  if (typeof limit !== "number") return { ok: true };

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const resetRaw = tenantRow?.invoices_month_reset as string | null | undefined;
  const resetAt = resetRaw ? new Date(resetRaw) : null;
  const lowerBound = resetAt && resetAt > monthStart ? resetAt : monthStart;

  const { count } = await adminClient
    .from("invoices")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .gte("created_at", lowerBound.toISOString());
  const used = count ?? 0;
  return used >= limit ? { ok: false, limit, used } : { ok: true };
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
