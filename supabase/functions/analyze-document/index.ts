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
import { buildReviewReason } from "../_shared/reviewReason.ts";
import { classifyInvoice, normalizeNifPT } from "../_shared/extractValidation.ts";

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
    .select("name, nif, sector, country, language, currency, invoice_name_variations, onboarding_data, allowed_document_types")
    .eq("id", tenantId).is("deleted_at", null).single();
  if (!tenant) return null;

  const { data: cats } = await supabase.from("categories")
    .select("code, label, sort_order, is_fixed")
    .eq("tenant_id", tenantId).eq("axis", "category").eq("is_active", true).order("sort_order");

  const { data: suppliers } = await supabase.from("suppliers")
    .select("name, name_variations").eq("tenant_id", tenantId).limit(100);

  const ob = (tenant.onboarding_data ?? {}) as OnboardingData;

  const categories = (cats ?? []).map((c) => ({
    code: c.code as string,
    label: c.label as string,
    isFixed: !!c.is_fixed,
  }));

  if (categories.length === 0 && Array.isArray(ob.categories)) {
    ob.categories.forEach((cat, i) => categories.push({
      code: cat.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || `cat_${i}`,
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

  // Tipos de documento aceites: F2 movemos para coluna dedicada; fallback ao
  // onboarding_data antigo enquanto n\u00e3o h\u00e1 backfill em todos os tenants.
  const allowedFromCol = Array.isArray(tenant.allowed_document_types)
    ? (tenant.allowed_document_types as string[]).filter((s) => typeof s === "string" && s.length > 0)
    : [];
  const documentTypes = allowedFromCol.length
    ? allowedFromCol
    : (Array.isArray(ob.documentTypes) && ob.documentTypes.length ? ob.documentTypes : ["fatura", "recibo"]);

  return {
    companyName: tenant.name as string,
    nif: (tenant.nif as string) ?? "",
    sector: (tenant.sector as string) ?? "geral",
    country: (tenant.country as string) ?? "PT",
    currency: (tenant.currency as string) ?? "EUR",
    nameVariations: ((tenant.invoice_name_variations as string[]) ?? []).length
      ? (tenant.invoice_name_variations as string[])
      : [(tenant.name as string).toUpperCase()],
    vatRates: getVatRatesForCountry((tenant.country as string) ?? "PT"),
    categories,
    knownSuppliers,
    documentTypes,
  };
}

const REJECTION_LABELS_PT: Record<string, string> = {
  nao_e_documento: "Não é um documento",
  documento_ilegivel: "Documento ilegível",
  nao_e_fatura: "Não é uma fatura",
  fatura_propria: "Fatura emitida pela própria empresa",
};

function rejectionToPt(reason: unknown): string {
  if (typeof reason !== "string" || !reason) return "Documento não validado";
  return REJECTION_LABELS_PT[reason] ?? reason;
}

const FALLBACK_PROMPT = `# OBJETIVO
És um contabilista sénior em Portugal. Analisa esta fatura e devolve um JSON estruturado.

# FORMATO DE SAÍDA (APENAS JSON)
{ "invoices": [{ "is_valid_document": boolean, "rejection_reason": "nao_e_documento"|"documento_ilegivel"|"nao_e_fatura"|"fatura_propria"|null, "document_type": string|null, "category": string|null, "doc_year": number|null, "doc_date": string|null, "data_vencimento": string|null, "supplier_name": string|null, "destinatario_nome": string|null, "supplier_nif": string|null, "doc_number": string|null, "valor_sem_iva": number|null, "taxa_iva": number|null, "valor_iva": number|null, "valor_total": number|null, "autoliquidacao": boolean, "payment_method": string|null, "supplier_iban": string|null, "summary": string|null, "confidence_score": number, "line_items": [] }] }`;

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
    let allowedTypes = new Set<string>();
    if (tenantId) {
      const cfg = await loadTenantConfig(adminClient, tenantId);
      if (cfg) {
        prompt = buildTenantPrompt(cfg);
        allowedTypes = new Set(cfg.documentTypes.map((s) => s.toLowerCase()));
      }
    }

    const geminiResult = await runGemini(prompt, data, mimeType);
    if (!geminiResult.ok) return json(geminiResult.status, { error: geminiResult.error }, corsHeaders);

    // B4: corre as mesmas validações do fluxo by-invoice e enriquece o output
    // com normalized_nif/needs_review/review_reason/document_type. O frontend
    // grava estes campos directamente — não pode haver um caminho que escape
    // a validação E.
    const enrichedInvoices = (geminiResult.normalized.invoices ?? []).map((inv) => {
      const row = (inv && typeof inv === "object" ? inv : {}) as Record<string, unknown>;
      const verdict = classifyInvoice(row, { allowedTypes });
      return {
        ...row,
        // Sobrepõe: para o cliente NÃO conseguir gravar um NIF estrangeiro
        // ou parcial como se fosse válido. Original strangeiro é descartado
        // (a UI deixa o user editar o supplier directamente depois).
        supplier_nif: verdict.normalizedNif,
        document_type: verdict.docType,
        _validation: {
          needs_review: verdict.needsReview,
          review_reason: verdict.reviewReason,
          reason_kind: verdict.reasonKind,
        },
      };
    });

    return json(200, { invoices: enrichedInvoices }, corsHeaders);
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

  // status analyzing durante a corrida — idempotente se já está analyzing.
  // S6: reset manual_review também, senão fatura que estava em failed/review
  // mantinha o badge "Verificação manual" durante a re-análise. UI confusa.
  await adminClient.from("invoices").update({
    status: "analyzing", review_reason: null, manual_review: false,
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

  const allowedTypes = new Set<string>(
    (cfg?.documentTypes ?? []).map((s) => s.toLowerCase())
  );
  const verdict = classifyInvoice(first, { allowedTypes });
  const { needsReview, reviewReason, normalizedNif, docType } = verdict;
  const confidence = (first.confidence_score as number | undefined) ?? 0;

  const { error: updateErr } = await adminClient.from("invoices").update({
    document_type: docType,
    category: (first.category as string | undefined) ?? null,
    doc_date: first.doc_date ?? null,
    doc_year: first.doc_year ?? null,
    data_vencimento: (first.data_vencimento as string | undefined) ?? null,
    supplier_name: typeof first.supplier_name === "string" ? (first.supplier_name as string).toUpperCase() : null,
    // E6: NIF canónico PT (9 dígitos) ou null se Gemini devolve algo estrangeiro/lixo.
    supplier_nif: normalizedNif,
    doc_number: first.doc_number ?? null,
    valor_sem_iva: (first.valor_sem_iva as number | undefined) ?? null,
    taxa_iva: (first.taxa_iva as number | undefined) ?? null,
    valor_iva: (first.valor_iva as number | undefined) ?? null,
    valor_total: (first.valor_total as number | undefined) ?? null,
    autoliquidacao: (first.autoliquidacao as boolean | undefined) ?? false,
    payment_method: first.payment_method ?? null,
    supplier_iban: first.supplier_iban ?? null,
    summary: first.summary ?? null,
    destinatario_nome: (first.destinatario_nome as string | undefined) ?? null,
    confidence_score: confidence,
    status: needsReview ? "review" : "inbox",
    manual_review: needsReview,
    review_reason: reviewReason,
  }).eq("id", invoiceId);

  if (updateErr) {
    await markFailed(adminClient, invoiceId, `update: ${updateErr.message?.slice(0, 120)}`);
    return json(500, { error: updateErr.message }, corsHeaders);
  }

  const lineItems = Array.isArray(first.line_items) ? first.line_items as Array<Record<string, unknown>> : [];
  if (lineItems.length) {
    const { error: liErr } = await adminClient.from("invoice_line_items").insert(
      lineItems.map((li, idx) => ({
        tenant_id: tenantId,
        invoice_id: invoiceId,
        line_number: idx + 1,
        description: li.description ?? null,
        quantity: li.quantity ?? null,
        unit: li.unit ?? null,
        preco_unitario: li.preco_unitario ?? null,
        total_sem_iva: li.total_sem_iva ?? null,
        taxa_iva: li.taxa_iva ?? null,
      })),
    );
    // Não-fatal: a fatura cabeça já foi gravada; só registamos para depois
    // poder ser rerun se for útil.
    if (liErr) {
      await logEdgeError({
        functionName: "analyze-document", level: "warn",
        message: "Falha a inserir invoice_line_items",
        error: liErr, tenantId,
        metadata: { invoice_id: invoiceId, lines: lineItems.length },
      });
    }
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
  // Heurística para escolher o kind certo: timeout vs. parse vs. erro genérico.
  // Permite ao watchdog filtrar por tipo e à UI mostrar tooltip humano.
  const lower = reason.toLowerCase();
  const kind = lower.includes("timeout") || lower.includes("aborted")
    ? "timeout"
    : lower.includes("json") || lower.includes("parse")
      ? "parse_error"
      : "internal_error";
  await adminClient.from("invoices").update({
    status: "failed",
    manual_review: true,
    review_reason: buildReviewReason(kind, reason),
  }).eq("id", invoiceId);
}

// Rejeição definitiva (Gemini decidiu que não é fatura processável).
// Soft-delete mantém o registo para dedup via attachment_hash. O ficheiro
// fica no bucket Supabase: a aba Ignoradas precisa de mostrar o conteúdo
// para o utilizador decidir se quer recuperar. Limpeza do bucket é feita
// por job de cron quando deleted_at > IGNORED_DAYS (30d).
async function rejectInvoice(
  adminClient: ReturnType<typeof createClient>,
  invoiceId: string,
  _storagePath: string | null,
  reason: string,
) {
  await adminClient.from("invoices").update({
    status: "failed",
    manual_review: false,
    review_reason: reason.slice(0, 500),
    deleted_at: new Date().toISOString(),
  }).eq("id", invoiceId);
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
