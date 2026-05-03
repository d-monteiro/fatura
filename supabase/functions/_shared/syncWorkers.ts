// Helpers partilhados pelos 4 workers do pipeline sync_jobs:
// discover-emails, fetch-attachments, analyze-batch, finalize-batch.
//
// Cobre: state transitions terminais (markRejected/Cancelled/FailedPermanent),
// release de lock optimista, refresh de token Google, snapshot de counters via
// RPC, self-trigger via pg_net, autorização inbound (cron secret / internal),
// e parsing de body. Tudo idempotente.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { logEdgeError } from "./logError.ts";

export type SupabaseAdmin = ReturnType<typeof createClient>;

// ─────────────────────────────────────────────────────────────────────────────
// Auth + bootstrap
// ─────────────────────────────────────────────────────────────────────────────

export interface WorkerEnv {
  supabaseUrl: string;
  serviceKey: string;
  cronSecret: string;
  googleClientId: string;
  googleClientSecret: string;
}

export function readWorkerEnv(): WorkerEnv {
  return {
    supabaseUrl: Deno.env.get("SUPABASE_URL") ?? "",
    serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    cronSecret: Deno.env.get("CRON_SECRET") ?? "",
    googleClientId: Deno.env.get("GOOGLE_CLIENT_ID") ?? "",
    googleClientSecret: Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "",
  };
}

export function isWorkerAuthorized(req: Request, env: WorkerEnv): boolean {
  const cron = req.headers.get("x-cron-secret");
  const internal = req.headers.get("x-internal-secret");
  return (
    (env.cronSecret.length > 0 && cron === env.cronSecret) ||
    (env.serviceKey.length > 0 && internal === env.serviceKey)
  );
}

export function makeAdmin(env: WorkerEnv): SupabaseAdmin {
  return createClient(env.supabaseUrl, env.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function jsonResponse(
  status: number,
  body: unknown,
  cors: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

export async function readJsonBody<T extends Record<string, unknown>>(
  req: Request,
): Promise<T> {
  try {
    const data = await req.json();
    return (data ?? {}) as T;
  } catch {
    return {} as T;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Estado das invoices: transições terminais e release de lock
// ─────────────────────────────────────────────────────────────────────────────

const TERMINAL_STATUSES = new Set([
  "completed",
  "cancelled",
  "failed_permanent",
  "rejected",
  "duplicate",
]);

interface ExtraInvoiceFields {
  email_subject?: string | null;
  email_from?: string | null;
  email_received_at?: string | null;
}

// Soft delete + razão. Usa-se quando Gemini disse "não é factura" ou quando
// pré-condições falham (sem anexos válidos, sem message_id, etc.).
export async function markRejected(
  admin: SupabaseAdmin,
  invoiceId: string,
  reason: string,
  extra?: ExtraInvoiceFields,
): Promise<void> {
  await admin.from("invoices").update({
    status: "rejected",
    review_reason: reason.slice(0, 200),
    deleted_at: new Date().toISOString(),
    locked_until: null,
    ...(extra ?? {}),
  }).eq("id", invoiceId).not("status", "in", "(completed,cancelled,failed_permanent,rejected,duplicate)");
}

// Cancelamento explícito do user. NÃO soft-delete (o user pode querer ver o
// que tinha sido cancelado). Lista UI distingue via badge "Cancelado".
export async function markCancelled(
  admin: SupabaseAdmin,
  invoiceId: string,
): Promise<void> {
  await admin.from("invoices").update({
    status: "cancelled",
    review_reason: "sync_cancelled",
    locked_until: null,
  }).eq("id", invoiceId).not("status", "in", "(completed,cancelled,failed_permanent,rejected,duplicate)");
}

// Esgotou retries em alguma fase. last_error fica como histórico.
export async function markFailedPermanent(
  admin: SupabaseAdmin,
  invoiceId: string,
  reason: string,
): Promise<void> {
  await admin.from("invoices").update({
    status: "failed_permanent",
    last_error: reason.slice(0, 500),
    locked_until: null,
  }).eq("id", invoiceId).not("status", "in", "(completed,cancelled,failed_permanent,rejected,duplicate)");
}

// Larga lock e devolve item ao bucket original. Usado quando worker quer
// re-tentar mais tarde sem queimar attempts (e.g. 429 Gemini).
export async function releaseLock(
  admin: SupabaseAdmin,
  invoiceId: string,
  expectedStatus: string,
): Promise<void> {
  await admin.from("invoices")
    .update({ locked_until: null })
    .eq("id", invoiceId)
    .eq("status", expectedStatus);
}

// Bump atómico de attempts em falha logical. RPC SQL evita race entre
// workers paralelos a fazer item.attempts+1 em JS. WHERE status=expected
// protege contra sobrepor o reset do trigger quando o status já mudou
// (e.g., analyze-document marcou 'failed' internamente).
export async function bumpAttempt(
  admin: SupabaseAdmin,
  invoiceId: string,
  expectedStatus: string,
  lastError: string,
  nextRetryAt?: Date | null,
): Promise<void> {
  const { error } = await admin.rpc("bump_invoice_attempt", {
    p_id: invoiceId,
    p_expected_status: expectedStatus,
    p_last_error: lastError.slice(0, 500),
    p_next_retry_at: nextRetryAt ? nextRetryAt.toISOString() : null,
  });
  if (error) {
    console.error(`[syncWorkers] bump_invoice_attempt falhou`, error.message);
  }
}

export function isTerminalStatus(status: string): boolean {
  return TERMINAL_STATUSES.has(status);
}

// Cálculo de backoff exponencial truncado: 1min · 2^attempts, max 5min.
export function backoffDelay(attempts: number): Date {
  const ms = Math.min(60_000 * Math.pow(2, Math.max(0, attempts)), 300_000);
  return new Date(Date.now() + ms);
}

// ─────────────────────────────────────────────────────────────────────────────
// sync_jobs: heartbeat, contadores, pause, fail, lock atómico discover
// ─────────────────────────────────────────────────────────────────────────────

// Substitui snapshotCountsByStatus(SELECT-all+JS reduce) por GROUP BY na BD.
// Também actualiza last_heartbeat_at + error_message em failed_permanent.
export async function refreshSyncJobCounts(
  admin: SupabaseAdmin,
  jobId: string,
): Promise<void> {
  const { error } = await admin.rpc("refresh_sync_job_counts", { p_job_id: jobId });
  if (error) {
    console.error(`[syncWorkers] refresh_sync_job_counts falhou`, error.message);
  }
}

// Lock atómico para discover-emails: substitui o pseudo-lock racy via
// SELECT-then-UPDATE. Garante que dois workers concorrentes não vão ambos
// fazer paginação Gmail no mesmo job.
export async function acquireSyncJobDiscoverLock(
  admin: SupabaseAdmin,
  jobId: string,
): Promise<boolean> {
  const { data, error } = await admin.rpc("sync_job_acquire_discover_lock", {
    p_job_id: jobId,
  });
  if (error) {
    console.error(`[syncWorkers] sync_job_acquire_discover_lock falhou`, error.message);
    return false;
  }
  return data === true;
}

export async function pauseSyncJobForReauth(
  admin: SupabaseAdmin,
  jobId: string,
  oauthTokenId: string | null,
  reason: string,
): Promise<void> {
  await admin.from("sync_jobs").update({
    status: "paused_reauth",
    error_message: reason.slice(0, 500),
  }).eq("id", jobId).in("status", ["queued", "discovering", "processing"]);
  if (oauthTokenId) {
    await admin.from("user_oauth_tokens").update({
      needs_reauth: true,
      reauth_reason: reason.slice(0, 200),
      reauth_flagged_at: new Date().toISOString(),
    }).eq("id", oauthTokenId);
  }
}

export async function failSyncJob(
  admin: SupabaseAdmin,
  jobId: string,
  reason: string,
): Promise<void> {
  await admin.from("sync_jobs").update({
    status: "error",
    error_message: reason.slice(0, 500),
    completed_at: new Date().toISOString(),
  }).eq("id", jobId).in("status", ["queued", "discovering", "processing", "paused_reauth"]);
}

export async function triggerSyncWorker(
  admin: SupabaseAdmin,
  fnName: "discover-emails" | "fetch-attachments" | "analyze-batch" | "finalize-batch",
  body: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await admin.rpc("trigger_sync_worker", {
    p_function: fnName,
    p_body: body,
  });
  if (error) {
    console.error(`[syncWorkers] trigger_sync_worker(${fnName}) falhou`, error.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Token Google: refresh + cache
// ─────────────────────────────────────────────────────────────────────────────

export interface OAuthTokensRow {
  access_token?: string;
  refresh_token?: string;
  token_expiry?: string;
}

export type RefreshResult =
  | { ok: true; accessToken: string }
  | { ok: false; reason: string };

interface RefreshOpts {
  admin: SupabaseAdmin;
  oauthTokenId: string;
  refreshToken: string | undefined;
  clientId: string;
  clientSecret: string;
}

export async function refreshGoogleToken(o: RefreshOpts): Promise<RefreshResult> {
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

export interface AccountWithToken {
  id: string;
  oauth_token_id: string | null;
  user_oauth_tokens: OAuthTokensRow | null;
}

// Cache por oauth_token_id dentro do mesmo worker invocation. Evita N
// refreshes para itens da mesma conta no mesmo batch.
export async function ensureFreshToken(
  admin: SupabaseAdmin,
  account: AccountWithToken,
  clientId: string,
  clientSecret: string,
  cache?: Map<string, string>,
): Promise<RefreshResult> {
  const tokenId = account.oauth_token_id;
  if (tokenId && cache) {
    const cached = cache.get(tokenId);
    if (cached) return { ok: true, accessToken: cached };
  }

  const tk = account.user_oauth_tokens;
  if (!tk?.access_token) return { ok: false, reason: "sem_access_token" };

  const expired = tk.token_expiry
    && new Date(tk.token_expiry).getTime() < Date.now() + 60_000;
  if (!expired) {
    if (tokenId && cache) cache.set(tokenId, tk.access_token);
    return { ok: true, accessToken: tk.access_token };
  }

  if (!tokenId) return { ok: false, reason: "sem_oauth_token_id" };

  const refreshed = await refreshGoogleToken({
    admin,
    oauthTokenId: tokenId,
    refreshToken: tk.refresh_token,
    clientId,
    clientSecret,
  });
  if (refreshed.ok && cache) cache.set(tokenId, refreshed.accessToken);
  return refreshed;
}

// ─────────────────────────────────────────────────────────────────────────────
// Logging cheap-info
// ─────────────────────────────────────────────────────────────────────────────

export function logBatchSummary(
  fnName: string,
  data: Record<string, string | number | null | undefined>,
): void {
  const parts = Object.entries(data)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${v ?? "null"}`)
    .join(" ");
  console.log(`[${fnName}] ${parts}`);
}

// Re-export logEdgeError para conveniência (workers só importam de cá).
export { logEdgeError };
