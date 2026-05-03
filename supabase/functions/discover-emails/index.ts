// ============================================
// Edge Function: discover-emails (Fase 2 do PLAN_HARDENING — review)
// Worker stateless: faz UMA página Gmail (max 50 msgs) e auto-dispara a
// próxima via pg_net se há nextPageToken. Quando esgota, transita o
// sync_job para 'processing' e dispara fetch-attachments.
//
// Idempotência: lock atómico via RPC sync_job_acquire_discover_lock (substitui
// o pseudo-lock SELECT-then-UPDATE racy da versão original).
// ============================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import {
  acquireSyncJobDiscoverLock,
  ensureFreshToken,
  failSyncJob,
  isWorkerAuthorized,
  jsonResponse,
  logBatchSummary,
  logEdgeError,
  makeAdmin,
  pauseSyncJobForReauth,
  readJsonBody,
  readWorkerEnv,
  refreshSyncJobCounts,
  triggerSyncWorker,
} from "../_shared/syncWorkers.ts";

const PAGE_SIZE = 50;

interface SyncJobRow {
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
}

interface AccountRow {
  id: string;
  email: string;
  user_id: string;
  company_id: string | null;
  tenant_id: string;
  oauth_token_id: string | null;
  is_active: boolean;
  user_oauth_tokens: { access_token?: string; refresh_token?: string; token_expiry?: string } | null;
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse(405, { error: "Method not allowed" }, corsHeaders);

  const t0 = Date.now();
  const env = readWorkerEnv();
  if (!isWorkerAuthorized(req, env)) {
    return jsonResponse(401, { error: "Unauthorized" }, corsHeaders);
  }

  const body = await readJsonBody<{ sync_job_id?: string }>(req);
  const syncJobId = body.sync_job_id;
  if (!syncJobId) return jsonResponse(400, { error: "sync_job_id é obrigatório" }, corsHeaders);

  const admin = makeAdmin(env);

  // Lock atómico — só prossegue um worker por job/heartbeat-window
  const acquired = await acquireSyncJobDiscoverLock(admin, syncJobId);
  if (!acquired) {
    return jsonResponse(200, { ok: true, skipped: "lock_busy" }, corsHeaders);
  }

  // Carrega job (já com status='discovering' depois do acquire) + account
  const { data: jobRow, error: jobErr } = await admin
    .from("sync_jobs")
    .select(`
      id, tenant_id, user_id, email_account_id, trigger,
      gmail_query, gmail_page_token, status, total_messages_seen,
      total_invoices_created
    `)
    .eq("id", syncJobId)
    .maybeSingle();

  if (jobErr || !jobRow) {
    await logEdgeError({
      functionName: "discover-emails",
      level: "error",
      message: "sync_job não encontrado após lock",
      metadata: { sync_job_id: syncJobId, db_error: jobErr?.message },
    });
    return jsonResponse(404, { error: "sync_job não encontrado" }, corsHeaders);
  }

  const job = jobRow as SyncJobRow;

  // Lock só é dado em queued/discovering — mas defensivo: se outra coisa
  // mudou para terminal, idempotência manda sair.
  if (["done", "cancelled", "error"].includes(job.status)) {
    return jsonResponse(200, { ok: true, skipped: `status=${job.status}` }, corsHeaders);
  }

  if (!job.email_account_id) {
    await failSyncJob(admin, job.id, "sync_job sem email_account_id");
    return jsonResponse(400, { error: "sync_job sem email_account_id" }, corsHeaders);
  }

  // Carrega email_account + token
  const { data: accountRow, error: accErr } = await admin
    .from("email_accounts")
    .select("id, email, user_id, company_id, tenant_id, oauth_token_id, is_active, user_oauth_tokens!oauth_token_id(access_token, refresh_token, token_expiry)")
    .eq("id", job.email_account_id)
    .maybeSingle();

  if (accErr || !accountRow) {
    await failSyncJob(admin, job.id, `email_account ${job.email_account_id} não encontrada`);
    return jsonResponse(404, { error: "email_account não encontrada" }, corsHeaders);
  }

  const account = accountRow as AccountRow;

  if (!account.is_active) {
    await failSyncJob(admin, job.id, "email_account inactiva");
    return jsonResponse(200, { ok: true, skipped: "account_inactive" }, corsHeaders);
  }
  if (!account.company_id) {
    await failSyncJob(admin, job.id, "email_account sem company_id");
    return jsonResponse(400, { error: "email_account sem company_id" }, corsHeaders);
  }

  const tk = await ensureFreshToken(admin, account, env.googleClientId, env.googleClientSecret);
  if (!tk.ok) {
    await pauseSyncJobForReauth(admin, job.id, account.oauth_token_id, tk.reason);
    return jsonResponse(200, { ok: false, paused: tk.reason }, corsHeaders);
  }
  const accessToken = tk.accessToken;

  // Listar 1 página Gmail
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
      await pauseSyncJobForReauth(admin, job.id, account.oauth_token_id, "gmail_401");
      return jsonResponse(200, { ok: false, paused: "gmail_401" }, corsHeaders);
    }
    await logEdgeError({
      functionName: "discover-emails",
      level: "error",
      message: `Gmail messages.list devolveu ${listResp.status}`,
      tenantId: job.tenant_id,
      userId: account.user_id,
      httpStatus: listResp.status,
      metadata: {
        sync_job_id: job.id,
        email: account.email,
        response: errText.slice(0, 500),
      },
    });
    await failSyncJob(admin, job.id, `gmail_list_${listResp.status}`);
    return jsonResponse(502, { error: "Gmail list falhou" }, corsHeaders);
  }

  const listData = await listResp.json();
  const messages = (listData.messages ?? []) as Array<{ id: string }>;
  const nextPageToken: string | null = listData.nextPageToken ?? null;

  // Criar stubs por mensagem (idempotente: index unique
  // (tenant_id, email_message_id, email_attachment_id) com NULLS NOT DISTINCT
  // garante que dois workers concorrentes em race não duplicam).
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
        // email_attachment_id NULL: stub por mensagem; fetch-attachments
        // expande para 1 invoice por anexo.
        status: "discovered" as const,
        sync_job_id: job.id,
        file_url: null,
      }));

    if (toInsert.length > 0) {
      const { data: inserted, error: insErr } = await admin
        .from("invoices")
        .insert(toInsert)
        .select("id");
      if (insErr) {
        // 23505 (unique violation) é race contra outro worker que metou
        // os mesmos message_ids. NULLS NOT DISTINCT no index agora dispara
        // — esperado e não fatal. Outros códigos são erro.
        if (insErr.code === "23505") {
          console.warn(`[discover-emails][${job.id}] race insert (esperado): ${insErr.message}`);
        } else {
          await logEdgeError({
            functionName: "discover-emails",
            level: "error",
            message: "Insert stubs falhou",
            tenantId: job.tenant_id,
            metadata: { sync_job_id: job.id, db_error: insErr.message, db_code: insErr.code },
          });
        }
      } else {
        createdCount = inserted?.length ?? 0;
      }
    }
  }

  // Update sync_job: pageToken + counters + heartbeat. Status 'processing'
  // se acabou paginação (last page).
  const isLastPage = !nextPageToken;
  const newStatus = isLastPage ? "processing" : "discovering";

  await admin.from("sync_jobs").update({
    gmail_page_token: nextPageToken,
    total_messages_seen: job.total_messages_seen + messages.length,
    total_invoices_created: job.total_invoices_created + createdCount,
    status: newStatus,
    last_heartbeat_at: new Date().toISOString(),
  }).eq("id", job.id).in("status", ["queued", "discovering"]);

  // Refresh counts via RPC (GROUP BY no Postgres em vez de SELECT-all)
  await refreshSyncJobCounts(admin, job.id);

  // Touch email_accounts.last_sync_at só se o job teve mensagens (S8)
  // OU é a última página de uma run que tinha visto algo (heartbeat útil).
  const sawAnyMessages = job.total_messages_seen + messages.length > 0;
  if (isLastPage && sawAnyMessages) {
    await admin.from("email_accounts").update({
      last_sync_at: new Date().toISOString(),
    }).eq("id", account.id);
  }

  // Auto-dispara próximo passo via pg_net (sobrevive à morte deste worker).
  if (nextPageToken) {
    await triggerSyncWorker(admin, "discover-emails", { sync_job_id: job.id });
  } else {
    await triggerSyncWorker(admin, "fetch-attachments", { sync_job_id: job.id });
  }

  logBatchSummary("discover-emails", {
    job: job.id,
    elapsed_ms: Date.now() - t0,
    page_messages: messages.length,
    created: createdCount,
    next_token: nextPageToken ? "yes" : "no",
    new_status: newStatus,
  });

  return jsonResponse(200, {
    ok: true,
    sync_job_id: job.id,
    page_messages: messages.length,
    created: createdCount,
    has_next: !!nextPageToken,
    new_status: newStatus,
  }, corsHeaders);
});
