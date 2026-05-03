// ============================================
// Edge Function: discover-emails (Fase 2 do PLAN_HARDENING)
// Worker stateless do pipeline sync_jobs. Faz UMA página Gmail (max 50 msgs)
// e auto-dispara a próxima via pg_net se há nextPageToken. Quando esgota a
// paginação, transita o sync_job para 'processing' e dispara fetch-attachments.
//
// Idempotente: o lock é o próprio sync_job.gmail_page_token + status. Se este
// worker morre, o watchdog (cron 1min) re-dispara para o mesmo sync_job.
// ============================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { logEdgeError } from "../_shared/logError.ts";

const PAGE_SIZE = 50;

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" }, corsHeaders);

  const t0 = Date.now();
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const cronSecret = Deno.env.get("CRON_SECRET") || "";
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID")!;
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET")!;

  const cronHeader = req.headers.get("x-cron-secret");
  const internalHeader = req.headers.get("x-internal-secret");
  const isAuthorized =
    (!!cronSecret && cronHeader === cronSecret) ||
    (!!internalHeader && internalHeader === serviceKey);
  if (!isAuthorized) return json(401, { error: "Unauthorized" }, corsHeaders);

  let body: { sync_job_id?: string } = {};
  try { body = await req.json(); } catch { /* corpo vazio */ }
  const syncJobId = body.sync_job_id;
  if (!syncJobId) return json(400, { error: "sync_job_id é obrigatório" }, corsHeaders);

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // 1. Carregar sync_job + email_account + token. Falha cedo se job já terminou.
  const { data: jobRow, error: jobErr } = await admin
    .from("sync_jobs")
    .select(`
      id, tenant_id, user_id, email_account_id, trigger,
      gmail_query, gmail_page_token, status, total_messages_seen,
      total_invoices_created, error_message
    `)
    .eq("id", syncJobId)
    .maybeSingle();

  if (jobErr || !jobRow) {
    await logEdgeError({
      functionName: "discover-emails",
      level: "error",
      message: "sync_job não encontrado",
      metadata: { sync_job_id: syncJobId, db_error: jobErr?.message },
    });
    return json(404, { error: "sync_job não encontrado" }, corsHeaders);
  }

  const job = jobRow as {
    id: string;
    tenant_id: string;
    user_id: string | null;
    email_account_id: string | null;
    trigger: string;
    gmail_query: string;
    gmail_page_token: string | null;
    status: string;
    total_messages_seen: number;
    total_invoices_created: number;
    error_message: string | null;
  };

  // Job já encerrado / cancelado: idempotência — não-op.
  if (["done", "cancelled", "error"].includes(job.status)) {
    return json(200, { ok: true, skipped: `status=${job.status}` }, corsHeaders);
  }

  if (!job.email_account_id) {
    await failJob(admin, job.id, "sync_job sem email_account_id");
    return json(400, { error: "sync_job sem email_account_id" }, corsHeaders);
  }

  // Bloqueio leve via heartbeat: se outro worker mexeu há <60s, este desiste.
  // O watchdog só re-dispara quando heartbeat > 90s. Esta verificação cobre
  // self-trigger duplicado (raro: pg_net + retry do edge runtime).
  const { data: heartbeat } = await admin
    .from("sync_jobs")
    .select("last_heartbeat_at, status")
    .eq("id", job.id)
    .single();
  const hb = heartbeat as { last_heartbeat_at: string; status: string };
  const hbAge = Date.now() - new Date(hb.last_heartbeat_at).getTime();
  if (hb.status === "discovering" && hbAge < 60_000) {
    console.log(`[discover-emails][${job.id}] skip stale heartbeat=${hbAge}ms`);
    return json(200, { ok: true, skipped: "fresh_heartbeat" }, corsHeaders);
  }

  // 2. Marcar 'discovering' (se ainda 'queued')
  if (job.status === "queued") {
    await admin.from("sync_jobs").update({
      status: "discovering",
      started_at: new Date().toISOString(),
    }).eq("id", job.id).eq("status", "queued");
  }

  // 3. Carregar email_account + token Google
  const { data: accountRow, error: accErr } = await admin
    .from("email_accounts")
    .select("id, email, user_id, company_id, tenant_id, oauth_token_id, is_active, user_oauth_tokens!oauth_token_id(access_token, refresh_token, token_expiry)")
    .eq("id", job.email_account_id)
    .maybeSingle();

  if (accErr || !accountRow) {
    await failJob(admin, job.id, `email_account ${job.email_account_id} não encontrada`);
    return json(404, { error: "email_account não encontrada" }, corsHeaders);
  }

  const account = accountRow as {
    id: string;
    email: string;
    user_id: string;
    company_id: string | null;
    tenant_id: string;
    oauth_token_id: string | null;
    is_active: boolean;
    user_oauth_tokens: { access_token?: string; refresh_token?: string; token_expiry?: string } | null;
  };

  if (!account.is_active) {
    await failJob(admin, job.id, "email_account inactiva");
    return json(200, { ok: true, skipped: "account_inactive" }, corsHeaders);
  }
  if (!account.company_id) {
    await failJob(admin, job.id, "email_account sem company_id");
    return json(400, { error: "email_account sem company_id" }, corsHeaders);
  }

  let accessToken: string | undefined = account.user_oauth_tokens?.access_token;
  if (!accessToken) {
    await pauseForReauth(admin, job.id, account.oauth_token_id, "sem_access_token");
    return json(200, { ok: false, paused: "sem_access_token" }, corsHeaders);
  }

  const expired = account.user_oauth_tokens?.token_expiry &&
    new Date(account.user_oauth_tokens.token_expiry).getTime() < Date.now() + 60_000;
  if (expired) {
    const refreshed = await refreshGoogleToken({
      admin,
      oauthTokenId: account.oauth_token_id!,
      refreshToken: account.user_oauth_tokens?.refresh_token,
      clientId,
      clientSecret,
    });
    if (!refreshed.ok) {
      await pauseForReauth(admin, job.id, account.oauth_token_id, refreshed.reason);
      return json(200, { ok: false, paused: refreshed.reason }, corsHeaders);
    }
    accessToken = refreshed.accessToken;
  }

  // 4. Listar 1 página Gmail
  const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  url.searchParams.set("q", job.gmail_query);
  url.searchParams.set("maxResults", String(PAGE_SIZE));
  if (job.gmail_page_token) url.searchParams.set("pageToken", job.gmail_page_token);

  const listResp = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!listResp.ok) {
    const errText = await listResp.text();
    if (listResp.status === 401) {
      await pauseForReauth(admin, job.id, account.oauth_token_id, "gmail_401");
      return json(200, { ok: false, paused: "gmail_401" }, corsHeaders);
    }
    await logEdgeError({
      functionName: "discover-emails",
      level: "error",
      message: `Gmail messages.list devolveu ${listResp.status}`,
      tenantId: job.tenant_id,
      userId: account.user_id,
      httpStatus: listResp.status,
      metadata: {
        sync_job_id: job.id, email: account.email,
        response: errText.slice(0, 500),
      },
    });
    await failJob(admin, job.id, `gmail_list_${listResp.status}`);
    return json(502, { error: "Gmail list falhou" }, corsHeaders);
  }

  const listData = await listResp.json();
  const messages = (listData.messages ?? []) as Array<{ id: string }>;
  const nextPageToken: string | null = listData.nextPageToken ?? null;

  // 5. Criar stubs por mensagem (1 invoice 'discovered' por message_id)
  // Idempotente: SELECT antes de INSERT — se já existe linha com este
  // message_id (de um sync anterior ou outro job), saltamos.
  let createdCount = 0;
  if (messages.length > 0) {
    const messageIds = messages.map((m) => m.id);
    const { data: existing } = await admin
      .from("invoices")
      .select("email_message_id")
      .eq("tenant_id", job.tenant_id)
      .in("email_message_id", messageIds);
    const existingSet = new Set(
      ((existing ?? []) as Array<{ email_message_id: string }>).map((r) => r.email_message_id),
    );
    const toInsert = messages
      .filter((m) => !existingSet.has(m.id))
      .map((m) => ({
        tenant_id: job.tenant_id,
        user_id: account.user_id,
        company_id: account.company_id,
        source: "email" as const,
        email_message_id: m.id,
        // email_attachment_id fica NULL: o stub é por *mensagem*. fetch-attachments
        // expande para 1 invoice por anexo (UPDATE no stub para o 1º, INSERT novos
        // para o resto).
        status: "discovered" as const,
        sync_job_id: job.id,
        // file_url só é preenchido em fetch-attachments após upload Storage.
        // A migration da Fase 2 relaxa NOT NULL para suportar stubs.
        file_url: null,
      }));

    if (toInsert.length > 0) {
      const { data: inserted, error: insErr } = await admin
        .from("invoices")
        .insert(toInsert)
        .select("id");
      if (insErr) {
        await logEdgeError({
          functionName: "discover-emails",
          level: "error",
          message: "Insert stubs falhou",
          tenantId: job.tenant_id,
          metadata: { sync_job_id: job.id, db_error: insErr.message, db_code: insErr.code },
        });
      } else {
        createdCount = inserted?.length ?? 0;
      }
    }
  }

  // 6. Update sync_job: pageToken + counters + heartbeat
  const newCountsByStatus = await snapshotCountsByStatus(admin, job.id);
  const newTotalMessagesSeen = job.total_messages_seen + messages.length;
  const newTotalInvoices = job.total_invoices_created + createdCount;

  const isLastPage = !nextPageToken;
  const newStatus = isLastPage ? "processing" : "discovering";

  await admin.from("sync_jobs").update({
    gmail_page_token: nextPageToken,
    total_messages_seen: newTotalMessagesSeen,
    total_invoices_created: newTotalInvoices,
    counts_by_status: newCountsByStatus,
    status: newStatus,
    last_heartbeat_at: new Date().toISOString(),
  }).eq("id", job.id);

  // Touch email_accounts.last_sync_at no momento da última página
  if (isLastPage) {
    await admin.from("email_accounts").update({
      last_sync_at: new Date().toISOString(),
    }).eq("id", account.id);
  }

  // 7. Auto-disparar próximo passo via pg_net (sobrevive à morte deste worker)
  if (nextPageToken) {
    await admin.rpc("trigger_sync_worker", {
      p_function: "discover-emails",
      p_body: { sync_job_id: job.id },
    });
  } else {
    await admin.rpc("trigger_sync_worker", {
      p_function: "fetch-attachments",
      p_body: { sync_job_id: job.id },
    });
  }

  const elapsed = Date.now() - t0;
  console.log(
    `[discover-emails][${job.id}] page elapsed=${elapsed}ms ` +
    `messages=${messages.length} created=${createdCount} ` +
    `next_token=${nextPageToken ? "yes" : "no"} new_status=${newStatus}`,
  );

  return json(200, {
    ok: true,
    sync_job_id: job.id,
    page_messages: messages.length,
    created: createdCount,
    has_next: !!nextPageToken,
    new_status: newStatus,
  }, corsHeaders);
});

// ─────────────────────────────────────────────────────────────────────────────

async function failJob(
  admin: ReturnType<typeof createClient>,
  jobId: string,
  reason: string,
) {
  await admin.from("sync_jobs").update({
    status: "error",
    error_message: reason.slice(0, 500),
    completed_at: new Date().toISOString(),
  }).eq("id", jobId);
}

async function pauseForReauth(
  admin: ReturnType<typeof createClient>,
  jobId: string,
  oauthTokenId: string | null,
  reason: string,
) {
  await admin.from("sync_jobs").update({
    status: "paused_reauth",
    error_message: reason.slice(0, 500),
  }).eq("id", jobId);
  if (oauthTokenId) {
    await admin.from("user_oauth_tokens").update({
      needs_reauth: true,
      reauth_reason: reason.slice(0, 200),
      reauth_flagged_at: new Date().toISOString(),
    }).eq("id", oauthTokenId);
  }
}

interface RefreshOpts {
  admin: ReturnType<typeof createClient>;
  oauthTokenId: string;
  refreshToken: string | undefined;
  clientId: string;
  clientSecret: string;
}

async function refreshGoogleToken(
  o: RefreshOpts,
): Promise<{ ok: true; accessToken: string } | { ok: false; reason: string }> {
  if (!o.refreshToken) return { ok: false, reason: "sem_refresh_token" };
  try {
    const resp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: o.clientId,
        client_secret: o.clientSecret,
        refresh_token: o.refreshToken,
        grant_type: "refresh_token",
      }),
    });
    if (!resp.ok) {
      const txt = await resp.text();
      return { ok: false, reason: `refresh_${resp.status}:${txt.slice(0, 80)}` };
    }
    const tokens = await resp.json();
    if (!tokens.access_token) return { ok: false, reason: "refresh_sem_access_token" };
    await o.admin.from("user_oauth_tokens").update({
      access_token: tokens.access_token,
      token_expiry: new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString(),
      needs_reauth: false,
      reauth_reason: null,
      reauth_flagged_at: null,
      ...(tokens.refresh_token && { refresh_token: tokens.refresh_token }),
    }).eq("id", o.oauthTokenId);
    return { ok: true, accessToken: tokens.access_token };
  } catch (e) {
    return { ok: false, reason: `refresh_exception:${e instanceof Error ? e.message : String(e)}` };
  }
}

async function snapshotCountsByStatus(
  admin: ReturnType<typeof createClient>,
  jobId: string,
): Promise<Record<string, number>> {
  const { data } = await admin
    .from("invoices")
    .select("status")
    .eq("sync_job_id", jobId);
  const out: Record<string, number> = {};
  for (const r of (data ?? []) as Array<{ status: string | null }>) {
    const k = r.status ?? "null";
    out[k] = (out[k] || 0) + 1;
  }
  return out;
}

function json(status: number, body: unknown, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
