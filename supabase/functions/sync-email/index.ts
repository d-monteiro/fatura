// ============================================
// Edge Function: sync-email
// Fase 1 (curta): descobre mensagens Gmail + cria stubs `analyzing` em BD.
// Fase 2 (background): fan-out paralelo a `analyze-document { invoice_id }`
// via EdgeRuntime.waitUntil — devolve logo ao frontend.
// ============================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

const MAX_MESSAGES_PER_RUN = 15;
const MAX_BASE64_LEN = 8_000_000;     // alinhado com analyze-document
const ALLOWED_MIMES = new Set(["application/pdf", "image/jpeg", "image/png", "image/jpg"]);
const FANOUT_CONCURRENCY = 5;

// deno-lint-ignore no-explicit-any
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID")!;
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
  const cronSecret = Deno.env.get("CRON_SECRET") || "";

  const cronHeader = req.headers.get("x-cron-secret");
  const isCron = !!cronSecret && cronHeader === cronSecret;

  let scopedUserId: string | null = null;
  if (!isCron) {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !anonKey) {
      return json(401, { success: false, error: "Unauthorized" }, corsHeaders);
    }
    const userClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json(401, { success: false, error: "Unauthorized" }, corsHeaders);
    scopedUserId = user.id;
  }

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const results: AccountResult[] = [];
  const createdInvoiceIds: string[] = [];

  try {
    let query = supabase
      .from("email_accounts")
      .select("*, user_oauth_tokens!oauth_token_id(access_token, refresh_token, token_expiry, email), tenants!tenant_id(id, onboarding_data)")
      .eq("is_active", true);
    if (scopedUserId) query = query.eq("user_id", scopedUserId);
    const { data: accounts, error: accountsErr } = await query;

    if (accountsErr) {
      return json(500, { success: false, error: accountsErr.message, code: "accounts_query_failed" }, corsHeaders);
    }
    if (!accounts?.length) {
      return json(200, {
        success: true, code: "no_accounts",
        message: "Nenhuma conta Gmail ligada a uma empresa. Liga uma conta em Definições.",
        results: [], total_discovered: 0, total_duplicates: 0, total_skipped: 0, total_errors: 0,
      }, corsHeaders);
    }

    type AccountWithJoins = typeof accounts[number] & {
      user_oauth_tokens: { access_token?: string; refresh_token?: string; token_expiry?: string; email?: string } | null;
      tenants: { id?: string; onboarding_data?: Record<string, unknown> } | null;
    };

    for (const accountRaw of accounts) {
      const account = accountRaw as AccountWithJoins;
      const r = await processAccount(account, {
        supabase, supabaseUrl, clientId, clientSecret,
      });
      results.push(r);
      createdInvoiceIds.push(...r.invoice_ids);
      await supabase.from("email_accounts").update({ last_sync_at: new Date().toISOString() }).eq("id", account.id);
    }

    // Fan-out em background — devolve já ao cliente
    if (createdInvoiceIds.length && typeof EdgeRuntime !== "undefined") {
      EdgeRuntime.waitUntil(fanOut(createdInvoiceIds, { supabaseUrl, serviceKey }));
    }

    const totals = results.reduce(
      (s, r) => ({
        discovered: s.discovered + r.discovered,
        duplicates: s.duplicates + r.duplicates,
        skipped: s.skipped + r.skipped,
        errors: s.errors + r.errors,
      }),
      { discovered: 0, duplicates: 0, skipped: 0, errors: 0 },
    );

    return json(200, {
      success: true,
      results: results.map(({ invoice_ids: _ids, ...rest }) => rest),
      total_discovered: totals.discovered,
      total_duplicates: totals.duplicates,
      total_skipped: totals.skipped,
      total_errors: totals.errors,
      // legado (front antigo ainda lê total_processed)
      total_processed: totals.discovered,
    }, corsHeaders);
  } catch (error) {
    return json(500, { success: false, error: error instanceof Error ? error.message : "Unknown error" }, corsHeaders);
  }
});

// ─────────────────────────────────────────────────────────────────────────────

interface AccountCtx {
  supabase: ReturnType<typeof createClient>;
  supabaseUrl: string;
  clientId: string;
  clientSecret: string;
}

interface AccountResult {
  email: string;
  discovered: number;
  duplicates: number;
  skipped: number;
  errors: number;
  note?: string;
  invoice_ids: string[];
}

type AccountRow = {
  id: string;
  email: string;
  user_id: string;
  company_id: string | null;
  tenant_id: string | null;
  oauth_token_id: string | null;
  user_oauth_tokens: { access_token?: string; refresh_token?: string; token_expiry?: string; email?: string } | null;
  tenants: { id?: string; onboarding_data?: Record<string, unknown> } | null;
};

async function processAccount(account: AccountRow, ctx: AccountCtx): Promise<AccountResult> {
  const { supabase, clientId, clientSecret } = ctx;
  const base: AccountResult = {
    email: account.email, discovered: 0, duplicates: 0, skipped: 0, errors: 0, invoice_ids: [],
  };

  const token = account.user_oauth_tokens;
  if (!token?.access_token) return { ...base, skipped: 1, note: "sem token" };

  const tenantRow = account.tenants;
  const tenantId = tenantRow?.id ?? account.tenant_id ?? null;
  const obData = (tenantRow?.onboarding_data ?? {}) as Record<string, unknown>;
  if (obData?.emailSync === false || obData?.emailSync === "false") {
    return { ...base, skipped: 1, note: "emailSync desligado" };
  }
  if (!tenantId) return { ...base, skipped: 1, note: "sem tenant" };
  const companyId = account.company_id;
  if (!companyId) return { ...base, skipped: 1, note: "sem company_id" };

  let accessToken = token.access_token;
  if (token.token_expiry && new Date(token.token_expiry) < new Date()) {
    if (!token.refresh_token) return { ...base, errors: 1, note: "sem refresh_token, reauth necessário" };
    try {
      const refreshResp = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: token.refresh_token,
          grant_type: "refresh_token",
        }),
      });
      if (!refreshResp.ok) {
        const errText = await refreshResp.text();
        return { ...base, errors: 1, note: `refresh falhou: ${errText.slice(0, 120)}` };
      }
      const tokens = await refreshResp.json();
      accessToken = tokens.access_token;
      await supabase.from("user_oauth_tokens").update({
        access_token: tokens.access_token,
        token_expiry: new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString(),
      }).eq("id", account.oauth_token_id);
    } catch (e) {
      return { ...base, errors: 1, note: `refresh excepção: ${e instanceof Error ? e.message : String(e)}` };
    }
  }

  const gmailQuery = encodeURIComponent(
    "has:attachment (filename:pdf OR filename:jpg OR filename:png) -category:promotions -category:social newer_than:7d",
  );

  const listResp = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${gmailQuery}&maxResults=${MAX_MESSAGES_PER_RUN}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!listResp.ok) {
    const errText = await listResp.text();
    return { ...base, errors: 1, note: `Gmail list ${listResp.status}: ${errText.slice(0, 120)}` };
  }
  const { messages = [] } = await listResp.json();

  for (const msg of messages) {
    try {
      const r = await processMessage(msg.id, {
        ctx, account, tenantId, companyId, accessToken,
      });
      base.discovered += r.discovered;
      base.duplicates += r.duplicates;
      base.skipped += r.skipped;
      base.errors += r.errors;
      base.invoice_ids.push(...r.invoice_ids);
    } catch (e) {
      base.errors++;
      base.note = `msg ${msg.id}: ${e instanceof Error ? e.message.slice(0, 80) : String(e)}`;
    }
  }

  return base;
}

interface MessageCtx {
  ctx: AccountCtx;
  account: AccountRow;
  tenantId: string;
  companyId: string;
  accessToken: string;
}

async function processMessage(msgId: string, m: MessageCtx): Promise<{
  discovered: number; duplicates: number; skipped: number; errors: number; invoice_ids: string[];
}> {
  const { supabase } = m.ctx;
  const out = { discovered: 0, duplicates: 0, skipped: 0, errors: 0, invoice_ids: [] as string[] };

  const msgResp = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=full`,
    { headers: { Authorization: `Bearer ${m.accessToken}` } },
  );
  if (!msgResp.ok) { out.errors++; return out; }
  const msgData = await msgResp.json();
  const parts = (msgData.payload?.parts || []) as Array<{
    filename?: string; mimeType?: string; body?: { attachmentId?: string; size?: number };
  }>;

  for (const part of parts) {
    if (!part.filename || !part.body?.attachmentId) continue;
    const mime = (part.mimeType || "").toLowerCase();
    if (!ALLOWED_MIMES.has(mime)) continue;
    if (part.body.size && part.body.size < 10_000) continue; // icons/logos

    const attachmentId = part.body.attachmentId;

    // dedup precoce: (tenant, message, attachment)
    const { data: existing } = await supabase
      .from("invoices")
      .select("id")
      .eq("tenant_id", m.tenantId)
      .eq("email_message_id", msgId)
      .eq("email_attachment_id", attachmentId)
      .limit(1);
    if (existing && existing.length > 0) { out.duplicates++; continue; }

    const attResp = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}/attachments/${attachmentId}`,
      { headers: { Authorization: `Bearer ${m.accessToken}` } },
    );
    if (!attResp.ok) { out.errors++; continue; }
    const attData = await attResp.json();
    const base64Data: string = (attData.data || "").replace(/-/g, "+").replace(/_/g, "/");
    if (!base64Data) { out.errors++; continue; }
    if (base64Data.length > MAX_BASE64_LEN) {
      out.skipped++; // > ~6MB: analyze-document rejeitaria
      continue;
    }

    const fileBytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
    const fileName = `${m.tenantId}/email_${msgId}_${attachmentId}_${part.filename}`;
    const { data: storageData, error: storageErr } = await supabase.storage
      .from("invoices")
      .upload(fileName, fileBytes, { contentType: mime });
    if (storageErr || !storageData?.path) { out.errors++; continue; }

    const { data: signed } = await supabase.storage
      .from("invoices")
      .createSignedUrl(storageData.path, 60 * 60 * 24 * 30);
    const fileUrl = signed?.signedUrl ?? "";

    const { data: inserted, error: insertErr } = await supabase
      .from("invoices")
      .insert({
        tenant_id: m.tenantId,
        user_id: m.account.user_id,
        company_id: m.companyId,
        source: "email",
        email_message_id: msgId,
        email_attachment_id: attachmentId,
        file_url: fileUrl,
        storage_path: storageData.path,
        status: "analyzing",
      })
      .select("id")
      .single();

    if (insertErr) {
      // violação de unique = race com outro sync; trata como duplicado
      if (insertErr.code === "23505") { out.duplicates++; continue; }
      out.errors++;
      continue;
    }

    out.discovered++;
    if (inserted?.id) out.invoice_ids.push(inserted.id);
  }

  return out;
}

// ─────────────────────────────────────────────────────────────────────────────

async function fanOut(invoiceIds: string[], opts: { supabaseUrl: string; serviceKey: string }) {
  // Pool com concorrência limitada para não inundar nem o próprio projecto nem o Gemini
  let cursor = 0;
  async function worker() {
    while (cursor < invoiceIds.length) {
      const idx = cursor++;
      const id = invoiceIds[idx];
      try {
        await fetch(`${opts.supabaseUrl}/functions/v1/analyze-document`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-internal-secret": opts.serviceKey,
          },
          body: JSON.stringify({ invoice_id: id }),
        });
      } catch {
        // erro → a invoice fica em analyzing; user reprocessa manualmente
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(FANOUT_CONCURRENCY, invoiceIds.length) }, worker));
}

function json(status: number, body: unknown, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
