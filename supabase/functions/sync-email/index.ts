// ============================================
// Edge Function: sync-email
// Descobre mensagens Gmail + cria stubs `analyzing` em BD.
// Fecha sync_runs síncronamente com totais de descoberta. A análise (Gemini +
// Drive + Sheets) corre depois via reprocess-pending (cron 15min) — este
// pipeline será substituído pelos workers stateless da Fase 2+ do hardening.
//
// Histórico:
// - Antes do hardening: EdgeRuntime.waitUntil(finishRun) corria fan-out em
//   background, mas o worker era morto a meio (HTTP 546) e sync_runs ficavam
//   em "running" indefinidamente. Ver PLAN_HARDENING.md Fase 0.
// - Fase 0 (2026-05-03): finishRun foi removido e fanout fire-and-forget
//   tomou o lugar.
// - Hardening review (2026-05-03): fanout fire-and-forget também foi removido
//   — fetches sem EdgeRuntime.waitUntil eram cancelados pelo runtime antes de
//   chegar ao receiver. A análise depende 100% do cron de reprocess-pending.
// ============================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { logEdgeError } from "../_shared/logError.ts";

const MAX_MESSAGES_PER_RUN = 25;
const MAX_BASE64_LEN = 8_000_000;     // alinhado com analyze-document
const MIN_ATTACHMENT_BYTES = 5_000;   // < 5KB: quase de certeza logo/ícone
// octet-stream é comum em PDFs enviados por ERPs com Content-Type errado
const ALLOWED_MIMES = new Set([
  "application/pdf",
  "application/x-pdf",
  "application/octet-stream",
  "image/jpeg",
  "image/jpg",
  "image/png",
]);
const ALLOWED_EXT_RE = /\.(pdf|jpe?g|png)$/i;

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const runId = crypto.randomUUID();
  const t0 = Date.now();

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID")!;
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
  const cronSecret = Deno.env.get("CRON_SECRET") || "";

  const cronHeader = req.headers.get("x-cron-secret");
  const isCron = !!cronSecret && cronHeader === cronSecret;
  const adminTenantHeader = req.headers.get("x-admin-tenant-id");

  console.log(`[sync-email][${runId}] start isCron=${isCron} adminTenant=${adminTenantHeader ?? "none"}`);

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  let scopedUserId: string | null = null;
  let scopedTenantId: string | null = null;
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

    if (adminTenantHeader) {
      const { data: isAdmin, error: isAdminErr } = await supabase.rpc("is_admin_global", { uid: user.id });
      if (isAdminErr || !isAdmin) {
        return json(403, { success: false, error: "Admin required" }, corsHeaders);
      }
      scopedTenantId = adminTenantHeader;
    } else {
      scopedUserId = user.id;
    }
  }

  const triggerKind: SyncTrigger = isCron ? "cron" : adminTenantHeader ? "admin" : "manual";
  const results: AccountResult[] = [];
  // tenant_id → sync_runs.id; uma linha por tenant distinto nesta execução.
  const syncRunByTenant = new Map<string, string>();

  try {
    let query = supabase
      .from("email_accounts")
      .select("*, user_oauth_tokens!oauth_token_id(access_token, refresh_token, token_expiry, email), tenants!tenant_id(id, onboarding_data)")
      .eq("is_active", true);
    if (scopedUserId) query = query.eq("user_id", scopedUserId);
    if (scopedTenantId) query = query.eq("tenant_id", scopedTenantId);
    const { data: accounts, error: accountsErr } = await query;

    if (accountsErr) {
      await logEdgeError({
        functionName: "sync-email",
        level: "error",
        message: "Falha a listar email_accounts",
        userId: scopedUserId,
        metadata: { run_id: runId, db_error: accountsErr.message },
      });
      return json(500, { success: false, error: accountsErr.message, code: "accounts_query_failed" }, corsHeaders);
    }
    if (!accounts?.length) {
      console.log(`[sync-email][${runId}] no_accounts userId=${scopedUserId}`);
      return json(200, {
        success: true, code: "no_accounts",
        message: "Nenhuma conta Gmail ligada a uma empresa. Liga uma conta em Definições.",
        results: [], total_discovered: 0, total_duplicates: 0, total_skipped: 0, total_errors: 0,
        total_messages_found: 0, total_attachments_seen: 0, run_id: runId,
      }, corsHeaders);
    }

    console.log(`[sync-email][${runId}] accounts=${accounts.length} userId=${scopedUserId}`);

    type AccountWithJoins = typeof accounts[number] & {
      user_oauth_tokens: { access_token?: string; refresh_token?: string; token_expiry?: string; email?: string } | null;
      tenants: { id?: string; onboarding_data?: Record<string, unknown> } | null;
    };

    // Criar sync_runs antes de processar — 1 por tenant único.
    const uniqueTenantIds = Array.from(new Set(
      accounts.map((a) => (a as AccountWithJoins).tenant_id).filter((v): v is string => !!v),
    ));
    for (const tId of uniqueTenantIds) {
      const { data: runRow } = await supabase.from("sync_runs").insert({
        tenant_id: tId,
        user_id: scopedUserId,
        trigger: triggerKind,
        status: "running",
      }).select("id").single();
      if (runRow) syncRunByTenant.set(tId, (runRow as { id: string }).id);
    }

    for (const accountRaw of accounts) {
      const account = accountRaw as AccountWithJoins;
      const r = await processAccount(account, {
        supabase, supabaseUrl, clientId, clientSecret, runId, syncRunByTenant,
      });
      results.push(r);
      // last_sync_at só avança em sucesso parcial (algo descoberto/dedup) ou
      // sucesso total (sem erros). Falha completa não actualiza — UI continua
      // a mostrar o último sync OK em vez de gaslightar o user.
      if (r.errors === 0 || r.discovered > 0 || r.duplicates > 0) {
        await supabase.from("email_accounts").update({ last_sync_at: new Date().toISOString() }).eq("id", account.id);
      }
    }

    // Fecha sync_runs síncrono com totais de descoberta. total_rejected é
    // mantido em real-time pelo trigger trg_invoices_bump_rejected conforme
    // analyze-document marca invoices como rejeitadas.
    await writeDiscoveryTotals(supabase, syncRunByTenant, results);

    const totals = results.reduce(
      (s, r) => ({
        discovered: s.discovered + r.discovered,
        duplicates: s.duplicates + r.duplicates,
        skipped: s.skipped + r.skipped,
        errors: s.errors + r.errors,
        messages_found: s.messages_found + r.messages_found,
        attachments_seen: s.attachments_seen + r.attachments_seen,
      }),
      { discovered: 0, duplicates: 0, skipped: 0, errors: 0, messages_found: 0, attachments_seen: 0 },
    );

    const elapsed = Date.now() - t0;
    console.log(
      `[sync-email][${runId}] done elapsed=${elapsed}ms ` +
      `messages=${totals.messages_found} attachments=${totals.attachments_seen} ` +
      `discovered=${totals.discovered} duplicates=${totals.duplicates} ` +
      `skipped=${totals.skipped} errors=${totals.errors}`,
    );

    // Se nada foi descoberto, persistir summary para o admin poder inspeccionar depois
    if (totals.discovered === 0 && totals.duplicates === 0) {
      await logEdgeError({
        functionName: "sync-email",
        level: totals.errors > 0 ? "warn" : "info",
        message: totals.messages_found === 0
          ? "Gmail não devolveu mensagens para os critérios"
          : "Gmail devolveu mensagens mas nenhuma fatura foi criada",
        userId: scopedUserId,
        metadata: {
          run_id: runId,
          elapsed_ms: elapsed,
          accounts: results.length,
          totals,
          per_account: results.map((r) => ({
            email: r.email,
            messages_found: r.messages_found,
            attachments_seen: r.attachments_seen,
            discovered: r.discovered,
            duplicates: r.duplicates,
            skipped: r.skipped,
            errors: r.errors,
            skip_reasons: r.skip_reasons,
            note: r.note,
          })),
        },
      });
    }

    return json(200, {
      success: true,
      run_id: runId,
      results,
      total_discovered: totals.discovered,
      total_duplicates: totals.duplicates,
      total_skipped: totals.skipped,
      total_errors: totals.errors,
      total_messages_found: totals.messages_found,
      total_attachments_seen: totals.attachments_seen,
      // legado (front antigo ainda lê total_processed)
      total_processed: totals.discovered,
    }, corsHeaders);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logEdgeError({
      functionName: "sync-email",
      message: msg,
      error,
      httpMethod: req.method,
      httpPath: new URL(req.url).pathname,
      httpStatus: 500,
      userId: scopedUserId,
      metadata: { run_id: runId },
    });
    // Marca runs criadas antes do crash como erro para o UI não ficar eternamente em "a sincronizar".
    if (syncRunByTenant.size > 0) {
      await supabase.from("sync_runs")
        .update({ status: "error", completed_at: new Date().toISOString(), error_message: msg.slice(0, 500) })
        .in("id", Array.from(syncRunByTenant.values()));
    }
    return json(500, { success: false, error: msg, run_id: runId }, corsHeaders);
  }
});

// ─────────────────────────────────────────────────────────────────────────────

type SyncTrigger = "cron" | "manual" | "admin";

interface AccountCtx {
  supabase: ReturnType<typeof createClient>;
  supabaseUrl: string;
  clientId: string;
  clientSecret: string;
  runId: string;
  syncRunByTenant: Map<string, string>;
}

interface AccountResult {
  email: string;
  tenant_id: string | null;
  discovered: number;
  duplicates: number;
  skipped: number;
  errors: number;
  messages_found: number;
  attachments_seen: number;
  skip_reasons: Record<string, number>;
  note?: string;
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

type GmailPart = {
  partId?: string;
  filename?: string;
  mimeType?: string;
  body?: { attachmentId?: string; size?: number };
  parts?: GmailPart[];
};

function flattenParts(parts: GmailPart[] | undefined): GmailPart[] {
  if (!parts?.length) return [];
  const out: GmailPart[] = [];
  for (const p of parts) {
    out.push(p);
    if (p.parts?.length) out.push(...flattenParts(p.parts));
  }
  return out;
}

function bumpReason(r: Record<string, number>, key: string) {
  r[key] = (r[key] || 0) + 1;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function processAccount(account: AccountRow, ctx: AccountCtx): Promise<AccountResult> {
  const { supabase, clientId, clientSecret, runId, syncRunByTenant } = ctx;
  const base: AccountResult = {
    email: account.email,
    tenant_id: account.tenant_id,
    discovered: 0, duplicates: 0, skipped: 0, errors: 0,
    messages_found: 0, attachments_seen: 0,
    skip_reasons: {},
  };

  const token = account.user_oauth_tokens;
  if (!token?.access_token) {
    await logEdgeError({
      functionName: "sync-email",
      level: "warn",
      message: "Conta Gmail sem access_token — precisa re-ligar",
      userId: account.user_id,
      tenantId: account.tenant_id,
      metadata: { run_id: runId, email: account.email },
    });
    return { ...base, skipped: 1, note: "sem token" };
  }

  const tenantRow = account.tenants;
  const tenantId = tenantRow?.id ?? account.tenant_id ?? null;
  const obData = (tenantRow?.onboarding_data ?? {}) as Record<string, unknown>;
  if (obData?.emailSync === false || obData?.emailSync === "false") {
    console.log(`[sync-email][${runId}] account=${account.email} skip=emailSync_off`);
    return { ...base, skipped: 1, note: "emailSync desligado" };
  }
  if (!tenantId) {
    console.warn(`[sync-email][${runId}] account=${account.email} skip=sem_tenant`);
    return { ...base, skipped: 1, note: "sem tenant" };
  }
  const companyId = account.company_id;
  if (!companyId) {
    console.warn(`[sync-email][${runId}] account=${account.email} skip=sem_company`);
    return { ...base, skipped: 1, note: "sem company_id" };
  }

  let accessToken = token.access_token;
  const expired = token.token_expiry && new Date(token.token_expiry) < new Date();
  if (expired) {
    if (!token.refresh_token) {
      await supabase.from("user_oauth_tokens").update({
        needs_reauth: true,
        reauth_reason: "sem_refresh_token",
        reauth_flagged_at: new Date().toISOString(),
      }).eq("id", account.oauth_token_id);
      await logEdgeError({
        functionName: "sync-email",
        level: "warn",
        message: "Token Google expirado sem refresh_token — precisa re-ligar a conta",
        userId: account.user_id,
        tenantId,
        metadata: { run_id: runId, email: account.email },
      });
      return { ...base, errors: 1, note: "sem refresh_token, reauth necessário" };
    }
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
        if (refreshResp.status === 400 || refreshResp.status === 401) {
          await supabase.from("user_oauth_tokens").update({
            needs_reauth: true,
            reauth_reason: errText.slice(0, 200),
            reauth_flagged_at: new Date().toISOString(),
          }).eq("id", account.oauth_token_id);
        }
        await logEdgeError({
          functionName: "sync-email",
          level: "error",
          message: "Refresh do token Google falhou",
          userId: account.user_id,
          tenantId,
          httpStatus: refreshResp.status,
          metadata: {
            run_id: runId, email: account.email,
            response: errText.slice(0, 500),
            hint: errText.includes("invalid_grant")
              ? "invalid_grant: refresh token revogado pelo user ou expirado"
              : undefined,
          },
        });
        return { ...base, errors: 1, note: `refresh falhou: ${errText.slice(0, 120)}` };
      }
      const tokens = await refreshResp.json();
      accessToken = tokens.access_token;
      await supabase.from("user_oauth_tokens").update({
        access_token: tokens.access_token,
        token_expiry: new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString(),
        needs_reauth: false,
        reauth_reason: null,
        reauth_flagged_at: null,
      }).eq("id", account.oauth_token_id);
      console.log(`[sync-email][${runId}] account=${account.email} token_refreshed`);
    } catch (e) {
      await logEdgeError({
        functionName: "sync-email",
        level: "error",
        message: "Excepção no refresh do token Google",
        error: e,
        userId: account.user_id,
        tenantId,
        metadata: { run_id: runId, email: account.email },
      });
      return { ...base, errors: 1, note: `refresh excepção: ${e instanceof Error ? e.message : String(e)}` };
    }
  }

  // Sem filtro de categoria — Gmail classifica faturas de serviços (luz, telecom,
  // SaaS) como Promotions/Updates e isso escondia-as. Dedup por email_message_id
  // + email_attachment_id em BD evita duplicar trabalho.
  const gmailQuery = encodeURIComponent(
    "has:attachment (filename:pdf OR filename:jpg OR filename:jpeg OR filename:png) newer_than:7d",
  );

  const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${gmailQuery}&maxResults=${MAX_MESSAGES_PER_RUN}`;
  const listResp = await fetch(listUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!listResp.ok) {
    const errText = await listResp.text();
    await logEdgeError({
      functionName: "sync-email",
      level: "error",
      message: `Gmail messages.list devolveu ${listResp.status}`,
      userId: account.user_id,
      tenantId,
      httpStatus: listResp.status,
      metadata: {
        run_id: runId, email: account.email,
        response: errText.slice(0, 500),
        hint: listResp.status === 403
          ? "403: app pode precisar de Google Verification para scopes sensitive/restricted"
          : listResp.status === 401
          ? "401: token inválido/revogado"
          : undefined,
      },
    });
    return { ...base, errors: 1, note: `Gmail list ${listResp.status}: ${errText.slice(0, 120)}` };
  }
  const listData = await listResp.json();
  const messages = (listData.messages ?? []) as Array<{ id: string }>;
  base.messages_found = messages.length;
  console.log(
    `[sync-email][${runId}] account=${account.email} gmail_list messages=${messages.length} ` +
    `estimate=${listData.resultSizeEstimate ?? "?"}`,
  );

  const syncRunId = syncRunByTenant.get(tenantId) ?? null;

  for (const msg of messages) {
    try {
      const r = await processMessage(msg.id, {
        ctx, account, tenantId, companyId, accessToken, syncRunId,
      });
      base.discovered += r.discovered;
      base.duplicates += r.duplicates;
      base.skipped += r.skipped;
      base.errors += r.errors;
      base.attachments_seen += r.attachments_seen;
      for (const [k, v] of Object.entries(r.skip_reasons)) {
        base.skip_reasons[k] = (base.skip_reasons[k] || 0) + v;
      }
    } catch (e) {
      base.errors++;
      base.note = `msg ${msg.id}: ${e instanceof Error ? e.message.slice(0, 80) : String(e)}`;
      console.error(`[sync-email][${runId}] account=${account.email} msg=${msg.id} excepção`, e);
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
  syncRunId: string | null;
}

interface MessageResult {
  discovered: number;
  duplicates: number;
  skipped: number;
  errors: number;
  attachments_seen: number;
  skip_reasons: Record<string, number>;
}

async function processMessage(msgId: string, m: MessageCtx): Promise<MessageResult> {
  const { supabase, runId } = m.ctx;
  const out: MessageResult = {
    discovered: 0, duplicates: 0, skipped: 0, errors: 0,
    attachments_seen: 0, skip_reasons: {},
  };

  const msgResp = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=full`,
    { headers: { Authorization: `Bearer ${m.accessToken}` } },
  );
  if (!msgResp.ok) {
    out.errors++;
    console.warn(`[sync-email][${runId}] msg=${msgId} get_failed status=${msgResp.status}`);
    return out;
  }
  const msgData = await msgResp.json();
  const payload = msgData.payload as GmailPart | undefined;

  // Headers Gmail — gravados na invoice para a aba Ignoradas mostrar
  // origem (assunto + remetente) quando o Gemini não preenche dados.
  const headers = (payload && Array.isArray((payload as { headers?: Array<{ name?: string; value?: string }> }).headers))
    ? (payload as { headers: Array<{ name?: string; value?: string }> }).headers
    : [];
  const headerValue = (name: string): string | null => {
    const h = headers.find((x) => (x.name ?? "").toLowerCase() === name.toLowerCase());
    return h?.value?.slice(0, 500) ?? null;
  };
  const emailSubject = headerValue("Subject");
  const emailFrom = headerValue("From");
  const internalDateMs = Number(msgData.internalDate ?? 0);
  const emailReceivedAt = internalDateMs > 0 ? new Date(internalDateMs).toISOString() : null;

  // Gmail devolve attachments em qualquer profundidade de `parts`. Achatar tudo
  // e filtrar — antes só olhávamos ao primeiro nível, o que perdia anexos em
  // multipart/alternative → multipart/related aninhado.
  const allParts = payload
    ? [payload, ...flattenParts(payload.parts)]
    : [];
  const candidates = allParts.filter((p) => p.filename && p.body?.attachmentId);

  console.log(
    `[sync-email][${runId}] msg=${msgId} parts_total=${allParts.length} ` +
    `candidates=${candidates.length}`,
  );

  for (const part of candidates) {
    out.attachments_seen++;
    const filename = part.filename || "";
    const mime = (part.mimeType || "").toLowerCase();
    const size = part.body?.size || 0;

    if (!ALLOWED_MIMES.has(mime)) {
      out.skipped++;
      bumpReason(out.skip_reasons, `mime:${mime || "unknown"}`);
      console.log(`[sync-email][${runId}] msg=${msgId} skip=mime file=${filename} mime=${mime}`);
      continue;
    }
    // octet-stream só passa com extensão reconhecida — evita apanhar lixo
    if (mime === "application/octet-stream" && !ALLOWED_EXT_RE.test(filename)) {
      out.skipped++;
      bumpReason(out.skip_reasons, "mime:octet-stream-bad-ext");
      console.log(`[sync-email][${runId}] msg=${msgId} skip=octet-stream-bad-ext file=${filename}`);
      continue;
    }
    if (size && size < MIN_ATTACHMENT_BYTES) {
      out.skipped++;
      bumpReason(out.skip_reasons, "size_too_small");
      console.log(`[sync-email][${runId}] msg=${msgId} skip=too_small file=${filename} size=${size}`);
      continue;
    }

    const attachmentId = part.body!.attachmentId!;

    // dedup precoce: (tenant, message, attachment)
    const { data: existing } = await supabase
      .from("invoices")
      .select("id")
      .eq("tenant_id", m.tenantId)
      .eq("email_message_id", msgId)
      .eq("email_attachment_id", attachmentId)
      .limit(1);
    if (existing && existing.length > 0) {
      out.duplicates++;
      console.log(`[sync-email][${runId}] msg=${msgId} dup file=${filename}`);
      continue;
    }

    const attResp = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}/attachments/${attachmentId}`,
      { headers: { Authorization: `Bearer ${m.accessToken}` } },
    );
    if (!attResp.ok) {
      out.errors++;
      console.warn(`[sync-email][${runId}] msg=${msgId} att_get_failed status=${attResp.status}`);
      continue;
    }
    const attData = await attResp.json();
    const base64Data: string = (attData.data || "").replace(/-/g, "+").replace(/_/g, "/");
    if (!base64Data) {
      out.errors++;
      console.warn(`[sync-email][${runId}] msg=${msgId} att_empty file=${filename}`);
      continue;
    }
    if (base64Data.length > MAX_BASE64_LEN) {
      out.skipped++;
      bumpReason(out.skip_reasons, "too_large");
      console.log(`[sync-email][${runId}] msg=${msgId} skip=too_large file=${filename} len=${base64Data.length}`);
      continue;
    }

    const fileBytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));

    // dedup por hash do conteúdo: o mesmo PDF chega via forwards e cópias
    // internas em emails distintos — sem isto pagamos N chamadas Gemini iguais.
    // NÃO filtra deleted_at: rejeições anteriores ("não é fatura", duplicadas
    // em finalize) ficam soft-deleted e precisamos reconhecê-las para não as
    // re-processar — senão o Gemini decide o mesmo outra vez.
    const attachmentHash = await sha256Hex(fileBytes);
    const { data: existingByHash } = await supabase
      .from("invoices")
      .select("id")
      .eq("tenant_id", m.tenantId)
      .eq("attachment_hash", attachmentHash)
      .limit(1);
    if (existingByHash && existingByHash.length > 0) {
      out.duplicates++;
      console.log(`[sync-email][${runId}] msg=${msgId} dup_hash file=${filename} hash=${attachmentHash.slice(0, 12)}`);
      continue;
    }

    // Normaliza MIME para upload — octet-stream virá como application/pdf
    // se for PDF por extensão (analyze-document valida depois).
    const effectiveMime = mime === "application/octet-stream"
      ? (/\.pdf$/i.test(filename) ? "application/pdf" : /\.png$/i.test(filename) ? "image/png" : "image/jpeg")
      : mime;

    // Path derivado do hash (ASCII, curto, previsível). Anexos com nomes
    // em PT (ç, º, í, espaços) ou attachmentId base64 longo eram rejeitados
    // pelo Storage com "Invalid key". O filename original é preservado no
    // insert da invoice.
    const extMatch = filename.match(/\.([a-z0-9]{1,8})$/i);
    const ext = extMatch ? extMatch[1].toLowerCase() : "bin";
    const fileName = `${m.tenantId}/email/${msgId}/${attachmentHash.slice(0, 16)}.${ext}`;
    const { data: storageData, error: storageErr } = await supabase.storage
      .from("invoices")
      .upload(fileName, fileBytes, { contentType: effectiveMime });
    if (storageErr || !storageData?.path) {
      out.errors++;
      await logEdgeError({
        functionName: "sync-email",
        level: "error",
        message: "Falha a gravar attachment em Storage",
        userId: m.account.user_id,
        tenantId: m.tenantId,
        metadata: {
          run_id: runId, email: m.account.email, msg_id: msgId,
          file: filename, storage_error: storageErr?.message,
        },
      });
      continue;
    }

    const { data: signed } = await supabase.storage
      .from("invoices")
      .createSignedUrl(storageData.path, 60 * 60 * 24 * 30);
    const fileUrl = signed?.signedUrl ?? "";

    const { error: insertErr } = await supabase
      .from("invoices")
      .insert({
        tenant_id: m.tenantId,
        user_id: m.account.user_id,
        company_id: m.companyId,
        source: "email",
        email_message_id: msgId,
        email_attachment_id: attachmentId,
        email_subject: emailSubject,
        email_from: emailFrom,
        email_received_at: emailReceivedAt,
        attachment_hash: attachmentHash,
        file_url: fileUrl,
        storage_path: storageData.path,
        status: "analyzing",
        sync_run_id: m.syncRunId,
      })
      .select("id")
      .single();

    if (insertErr) {
      // violação de unique = race com outro sync; trata como duplicado
      if (insertErr.code === "23505") {
        out.duplicates++;
        // Apaga o ficheiro do Storage que acabámos de fazer upload — outra
        // run já tem invoice criada com este hash, este file fica órfão.
        await supabase.storage.from("invoices").remove([storageData.path]);
        console.log(`[sync-email][${runId}] msg=${msgId} dup_race file=${filename}`);
        continue;
      }
      out.errors++;
      await logEdgeError({
        functionName: "sync-email",
        level: "error",
        message: "Insert em `invoices` falhou",
        userId: m.account.user_id,
        tenantId: m.tenantId,
        metadata: {
          run_id: runId, msg_id: msgId, file: filename,
          db_error: insertErr.message, db_code: insertErr.code,
        },
      });
      continue;
    }

    out.discovered++;
    console.log(`[sync-email][${runId}] msg=${msgId} discovered file=${filename}`);
  }

  return out;
}

// ─────────────────────────────────────────────────────────────────────────────

// Fecha cada sync_runs sincronamente com totais de descoberta:
//   total_discovered = invoices criadas (vão a Gemini depois via reprocess-pending)
//   total_duplicates = dedup precoce (msg+att) + dedup hash
//   total_rejected   = mantido em real-time pelo trigger trg_invoices_bump_rejected
//                      conforme analyze-document marca invoices como rejeitadas.
async function writeDiscoveryTotals(
  admin: ReturnType<typeof createClient>,
  syncRunByTenant: Map<string, string>,
  results: AccountResult[],
): Promise<void> {
  const agg = aggregateByTenant(results);
  const now = new Date().toISOString();

  for (const [tenantId, runId] of syncRunByTenant.entries()) {
    const a = agg.get(tenantId) ?? emptyAgg();
    await admin.from("sync_runs").update({
      status: "done",
      completed_at: now,
      total_messages: a.messages_found,
      total_discovered: a.discovered,
      total_duplicates: a.duplicates,
      total_skipped: a.skipped,
      total_errors: a.errors,
    }).eq("id", runId);
  }
}

interface TenantAgg {
  messages_found: number;
  discovered: number;
  duplicates: number;
  skipped: number;
  errors: number;
}

function emptyAgg(): TenantAgg {
  return { messages_found: 0, discovered: 0, duplicates: 0, skipped: 0, errors: 0 };
}

function aggregateByTenant(results: AccountResult[]): Map<string, TenantAgg> {
  const out = new Map<string, TenantAgg>();
  for (const r of results) {
    if (!r.tenant_id) continue;
    const cur = out.get(r.tenant_id) ?? emptyAgg();
    cur.messages_found += r.messages_found;
    cur.discovered += r.discovered;
    cur.duplicates += r.duplicates;
    cur.skipped += r.skipped;
    cur.errors += r.errors;
    out.set(r.tenant_id, cur);
  }
  return out;
}

function json(status: number, body: unknown, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
