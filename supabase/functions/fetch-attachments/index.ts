// ============================================
// Edge Function: fetch-attachments (Fase 3 do PLAN_HARDENING)
// Worker stateless: pega N invoices status='discovered' (lock 90s via
// pick_invoices_for_processing), descarrega anexos do Gmail, faz upload
// para Storage, calcula sha256, e transita para 'analyzing'. Mensagens
// sem anexos válidos viram 'rejected' (soft delete).
//
// Multi-anexo: o stub criado pelo discover-emails é por *mensagem*. Aqui
// expandimos: o 1º anexo válido reaproveita a invoice existente (UPDATE),
// os restantes geram INSERTs novos com email_attachment_id próprio.
//
// Idempotência: lock via locked_until (90s); collision por sha256
// vira a invoice em 'rejected' com review_reason='duplicate_hash' antes
// do upload. Worker pode morrer a meio sem deixar ficheiros órfãos
// duplicados — só o que fez upload nesta invocação.
// ============================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { logEdgeError } from "../_shared/logError.ts";

const BATCH_SIZE = 5;
const LOCK_SECONDS = 90;
const MIN_ATTACHMENT_BYTES = 5_000;
const MAX_BASE64_LEN = 8_000_000;
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
  try { body = await req.json(); } catch { /* corpo vazio é OK quando chamado pelo watchdog */ }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // 1. Pega batch via pick_invoices_for_processing (FOR UPDATE SKIP LOCKED)
  const { data: pickedRaw, error: pickErr } = await admin.rpc(
    "pick_invoices_for_processing",
    { p_status: "discovered", p_limit: BATCH_SIZE, p_lock_seconds: LOCK_SECONDS },
  );

  if (pickErr) {
    await logEdgeError({
      functionName: "fetch-attachments",
      level: "error",
      message: "pick_invoices_for_processing falhou",
      metadata: { db_error: pickErr.message, sync_job_id: body.sync_job_id },
    });
    return json(500, { error: pickErr.message }, corsHeaders);
  }

  const picked = (pickedRaw ?? []) as Array<PickedInvoice>;
  if (picked.length === 0) {
    return json(200, { ok: true, processed: 0 }, corsHeaders);
  }

  // 2. Marcar status='fetching' no batch para a UI ver progresso. O lock
  // já está em locked_until — esta UPDATE é cosmética.
  await admin.from("invoices")
    .update({ status: "fetching" })
    .in("id", picked.map((p) => p.id));

  // 3. Carregar sync_jobs e email_accounts em batch — invoices só conhecem
  // sync_job_id, o token Google está em user_oauth_tokens via email_accounts.
  const syncJobIds = Array.from(new Set(picked.map((p) => p.sync_job_id).filter((v): v is string => !!v)));
  let jobsById = new Map<string, JobRow>();
  if (syncJobIds.length > 0) {
    const { data: jobs } = await admin
      .from("sync_jobs")
      .select("id, email_account_id, tenant_id, user_id, status")
      .in("id", syncJobIds);
    jobsById = new Map(((jobs ?? []) as JobRow[]).map((j) => [j.id, j]));
  }

  // Carregar email_accounts + tokens em batch
  const acctIds = Array.from(new Set(
    Array.from(jobsById.values())
      .map((j) => j.email_account_id)
      .filter((v): v is string => !!v),
  ));
  let accountsById = new Map<string, AccountRow>();
  if (acctIds.length > 0) {
    const { data: accounts } = await admin
      .from("email_accounts")
      .select("id, email, user_id, company_id, tenant_id, oauth_token_id, is_active, user_oauth_tokens!oauth_token_id(access_token, refresh_token, token_expiry)")
      .in("id", acctIds);
    accountsById = new Map(((accounts ?? []) as AccountRow[]).map((a) => [a.id, a]));
  }

  // Cache token refrescado por oauth_token_id (1 refresh por conta por run)
  const tokenCache = new Map<string, string>();

  let okCount = 0;
  let rejectedCount = 0;
  let errorCount = 0;
  const updatedJobIds = new Set<string>();

  for (const item of picked) {
    if (item.sync_job_id) updatedJobIds.add(item.sync_job_id);
    try {
      const job = item.sync_job_id ? jobsById.get(item.sync_job_id) : null;
      const accountId = job?.email_account_id;
      const account = accountId ? accountsById.get(accountId) : null;
      if (!account) {
        await markRejected(admin, item.id, "sem_account");
        rejectedCount++;
        continue;
      }

      // Cancelamento: o user pode ter premido "Cancelar" — desiste
      if (job && (job.status === "cancelled" || job.status === "error")) {
        // Liberta lock; o item fica em 'fetching' até cleanup. Outra opção
        // seria voltar a 'discovered' — mas como o sync_job está cancelado,
        // não vale a pena gastar Gmail nele. Soft delete em vez disso.
        await markRejected(admin, item.id, "sync_job_cancelled");
        rejectedCount++;
        continue;
      }

      // Token refresh (cache por oauth_token_id)
      let token: string | undefined;
      if (account.oauth_token_id) {
        token = tokenCache.get(account.oauth_token_id);
      }
      if (!token) {
        const tk = await ensureFreshToken({ admin, account, clientId, clientSecret });
        if (!tk.ok) {
          // Pausa o sync_job para reauth; liberta lock para watchdog re-tentar
          // depois. Sem isto, o item fica preso em fetching até locked_until expirar.
          if (job) await pauseJobForReauth(admin, job.id, account.oauth_token_id, tk.reason);
          await releaseLock(admin, item.id);
          errorCount++;
          continue;
        }
        token = tk.accessToken;
        if (account.oauth_token_id) tokenCache.set(account.oauth_token_id, token);
      }

      const result = await processInvoice(item, account, token, admin);
      if (result === "ok") okCount++;
      else if (result === "rejected") rejectedCount++;
      else errorCount++;
    } catch (e) {
      errorCount++;
      console.error(`[fetch-attachments] invoice=${item.id} excepção`, e);
      await admin.from("invoices").update({
        last_error: e instanceof Error ? e.message.slice(0, 500) : String(e).slice(0, 500),
      }).eq("id", item.id);
      // Liberta lock — o cron pega na próxima
      await releaseLock(admin, item.id);
    }
  }

  // 4. Heartbeat + counters dos sync_jobs envolvidos
  for (const jobId of updatedJobIds) {
    const counts = await snapshotCountsByStatus(admin, jobId);
    await admin.from("sync_jobs").update({
      counts_by_status: counts,
      last_heartbeat_at: new Date().toISOString(),
    }).eq("id", jobId);
  }

  // 5. Self-trigger se ainda há discovered não-locked. O watchdog também
  // dispara independentemente, mas auto-trigger acelera o drain.
  const { count: remaining } = await admin
    .from("invoices")
    .select("id", { count: "exact", head: true })
    .eq("status", "discovered")
    .is("deleted_at", null);
  if ((remaining ?? 0) > 0) {
    await admin.rpc("trigger_sync_worker", {
      p_function: "fetch-attachments",
      p_body: {},
    });
  } else {
    // Não há mais discovered. Marca jobs envolvidos como 'done' se não
    // resta trabalho (discovered/fetching/analyzing/extracted) — aqui o
    // watchdog também faz isto, mas adiantar evita 1min de delay na UI.
    if (updatedJobIds.size > 0) {
      const { data: leftovers } = await admin
        .from("invoices")
        .select("sync_job_id, status")
        .in("sync_job_id", Array.from(updatedJobIds))
        .in("status", ["discovered", "fetching", "analyzing", "extracted"])
        .is("deleted_at", null);
      const stillActive = new Set(
        ((leftovers ?? []) as Array<{ sync_job_id: string }>).map((r) => r.sync_job_id),
      );
      const completed = Array.from(updatedJobIds).filter((id) => !stillActive.has(id));
      if (completed.length > 0) {
        await admin.from("sync_jobs").update({
          status: "done",
          completed_at: new Date().toISOString(),
        }).in("id", completed).eq("status", "processing");
      }
    }
  }

  const elapsed = Date.now() - t0;
  console.log(
    `[fetch-attachments] batch elapsed=${elapsed}ms ` +
    `picked=${picked.length} ok=${okCount} rejected=${rejectedCount} errors=${errorCount} ` +
    `remaining=${remaining ?? "?"}`,
  );

  return json(200, {
    ok: true,
    processed: picked.length,
    ok_count: okCount,
    rejected: rejectedCount,
    errors: errorCount,
    remaining: remaining ?? null,
  }, corsHeaders);
});

// ─────────────────────────────────────────────────────────────────────────────

interface PickedInvoice {
  id: string;
  tenant_id: string;
  user_id: string | null;
  company_id: string;
  email_message_id: string | null;
  sync_job_id: string | null;
  status: string;
  attempts: number;
}

interface JobRow {
  id: string;
  email_account_id: string | null;
  tenant_id: string;
  user_id: string | null;
  status: string;
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

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function processInvoice(
  invoice: PickedInvoice,
  account: AccountRow,
  accessToken: string,
  admin: ReturnType<typeof createClient>,
): Promise<"ok" | "rejected" | "error"> {
  const msgId = invoice.email_message_id;
  if (!msgId) {
    await markRejected(admin, invoice.id, "sem_email_message_id");
    return "rejected";
  }

  // 1. messages.get full
  const msgResp = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=full`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (!msgResp.ok) {
    if (msgResp.status === 404) {
      // Mensagem apagada do Gmail entre discover e fetch — soft delete
      await markRejected(admin, invoice.id, "gmail_404");
      return "rejected";
    }
    await admin.from("invoices").update({
      last_error: `gmail_get_${msgResp.status}`,
    }).eq("id", invoice.id);
    await releaseLock(admin, invoice.id);
    return "error";
  }

  const msgData = await msgResp.json();
  const payload = msgData.payload as GmailPart | undefined;

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

  const allParts = payload ? [payload, ...flattenParts(payload.parts)] : [];
  const candidates = allParts.filter((p) => p.filename && p.body?.attachmentId);

  // Filtra por MIME + ext + size sobre o que o Gmail diz (sem download ainda)
  const valid: GmailPart[] = [];
  for (const part of candidates) {
    const filename = part.filename || "";
    const mime = (part.mimeType || "").toLowerCase();
    const size = part.body?.size || 0;
    if (!ALLOWED_MIMES.has(mime)) continue;
    if (mime === "application/octet-stream" && !ALLOWED_EXT_RE.test(filename)) continue;
    if (size && size < MIN_ATTACHMENT_BYTES) continue;
    valid.push(part);
  }

  if (valid.length === 0) {
    await markRejected(admin, invoice.id, "sem_anexos_validos", {
      email_subject: emailSubject,
      email_from: emailFrom,
      email_received_at: emailReceivedAt,
    });
    return "rejected";
  }

  // 2. Para cada anexo válido: download → sha256 → dedup → upload Storage.
  // O 1º vai para a invoice existente (UPDATE); os restantes geram INSERT novos.
  let firstAnexoConsumed = false;
  let okOnAtLeastOne = false;
  let lastError: string | null = null;

  for (let i = 0; i < valid.length; i++) {
    const part = valid[i];
    const filename = part.filename || `attachment_${i}`;
    const attachmentId = part.body!.attachmentId!;
    const mime = (part.mimeType || "").toLowerCase();

    try {
      const attResp = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}/attachments/${attachmentId}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!attResp.ok) {
        lastError = `gmail_att_${attResp.status}`;
        continue;
      }
      const attData = await attResp.json();
      const base64Data: string = (attData.data || "").replace(/-/g, "+").replace(/_/g, "/");
      if (!base64Data) {
        lastError = "att_empty";
        continue;
      }
      if (base64Data.length > MAX_BASE64_LEN) {
        lastError = "too_large";
        continue;
      }
      const fileBytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
      const hash = await sha256Hex(fileBytes);

      // Dedup por hash (não filtra deleted_at: itens rejeitados antes não voltam)
      const { data: existingByHash } = await admin
        .from("invoices")
        .select("id, deleted_at")
        .eq("tenant_id", invoice.tenant_id)
        .eq("attachment_hash", hash)
        .neq("id", invoice.id)
        .limit(1);
      if (existingByHash && existingByHash.length > 0) {
        // Hash colidiu com outra invoice viva ou rejeitada — duplicado
        if (i === 0 && !firstAnexoConsumed) {
          await markRejected(admin, invoice.id, "duplicate_hash");
          firstAnexoConsumed = true;
        }
        // Anexos seguintes: skip silencioso (não cria novo INSERT duplicado)
        continue;
      }

      const effectiveMime = mime === "application/octet-stream"
        ? (/\.pdf$/i.test(filename)
          ? "application/pdf"
          : /\.png$/i.test(filename)
          ? "image/png"
          : "image/jpeg")
        : mime;

      const extMatch = filename.match(/\.([a-z0-9]{1,8})$/i);
      const ext = extMatch ? extMatch[1].toLowerCase() : "bin";
      const storageName = `${invoice.tenant_id}/email/${msgId}/${hash.slice(0, 16)}.${ext}`;

      const { data: storageData, error: storageErr } = await admin.storage
        .from("invoices")
        .upload(storageName, fileBytes, {
          contentType: effectiveMime,
          upsert: true, // idempotência: re-tentativa após crash não falha
        });
      if (storageErr || !storageData?.path) {
        lastError = `storage_${storageErr?.message?.slice(0, 80) ?? "no_path"}`;
        continue;
      }

      const { data: signed } = await admin.storage
        .from("invoices")
        .createSignedUrl(storageData.path, 60 * 60 * 24 * 30);
      const fileUrl = signed?.signedUrl ?? null;

      if (i === 0 || !firstAnexoConsumed) {
        // Reaproveita o stub original
        const { error: updateErr } = await admin.from("invoices").update({
          email_attachment_id: attachmentId,
          email_subject: emailSubject,
          email_from: emailFrom,
          email_received_at: emailReceivedAt,
          attachment_hash: hash,
          file_url: fileUrl,
          storage_path: storageData.path,
          status: "analyzing",
          locked_until: null,
          attempts: 0,
          last_error: null,
        }).eq("id", invoice.id);
        if (updateErr) {
          // Race: outro worker pode ter mexido. Retry no próximo cron.
          lastError = `update_${updateErr.code}_${updateErr.message?.slice(0, 60)}`;
          // Limpa Storage para não deixar órfão
          await admin.storage.from("invoices").remove([storageData.path]).catch(() => null);
          continue;
        }
        firstAnexoConsumed = true;
        okOnAtLeastOne = true;
      } else {
        // Anexo extra: cria NOVA invoice na mesma mensagem (mesmo sync_job)
        const { error: insertErr } = await admin.from("invoices").insert({
          tenant_id: invoice.tenant_id,
          user_id: account.user_id,
          company_id: account.company_id,
          source: "email",
          email_message_id: msgId,
          email_attachment_id: attachmentId,
          email_subject: emailSubject,
          email_from: emailFrom,
          email_received_at: emailReceivedAt,
          attachment_hash: hash,
          file_url: fileUrl,
          storage_path: storageData.path,
          status: "analyzing",
          sync_job_id: invoice.sync_job_id,
        });
        if (insertErr) {
          // 23505 = race com hash dedup (outro worker meteu agora). Apaga
          // ficheiro Storage e segue em frente.
          if (insertErr.code === "23505") {
            await admin.storage.from("invoices").remove([storageData.path]).catch(() => null);
          } else {
            lastError = `insert_extra_${insertErr.code}`;
            await admin.storage.from("invoices").remove([storageData.path]).catch(() => null);
          }
          continue;
        }
        okOnAtLeastOne = true;
      }
    } catch (e) {
      lastError = e instanceof Error ? e.message.slice(0, 80) : String(e).slice(0, 80);
      continue;
    }
  }

  if (!firstAnexoConsumed) {
    // Todos os anexos válidos falharam download/upload — incrementa attempts,
    // liberta lock, e deixa para o cron retentar (até 3 vezes).
    if (invoice.attempts >= 3) {
      await markRejected(admin, invoice.id, `failed_permanent:${lastError ?? "unknown"}`);
      return "rejected";
    }
    await admin.from("invoices").update({
      last_error: lastError ?? "fetch_failed",
      locked_until: null,
    }).eq("id", invoice.id);
    return "error";
  }

  return okOnAtLeastOne ? "ok" : "error";
}

// ─────────────────────────────────────────────────────────────────────────────

interface ExtraInvoiceFields {
  email_subject?: string | null;
  email_from?: string | null;
  email_received_at?: string | null;
}

async function markRejected(
  admin: ReturnType<typeof createClient>,
  invoiceId: string,
  reason: string,
  extra?: ExtraInvoiceFields,
) {
  await admin.from("invoices").update({
    status: "rejected",
    review_reason: reason.slice(0, 200),
    deleted_at: new Date().toISOString(),
    locked_until: null,
    ...extra,
  }).eq("id", invoiceId);
}

async function releaseLock(
  admin: ReturnType<typeof createClient>,
  invoiceId: string,
) {
  await admin.from("invoices")
    .update({ status: "discovered", locked_until: null })
    .eq("id", invoiceId);
}

interface FreshTokenOpts {
  admin: ReturnType<typeof createClient>;
  account: AccountRow;
  clientId: string;
  clientSecret: string;
}

async function ensureFreshToken(
  o: FreshTokenOpts,
): Promise<{ ok: true; accessToken: string } | { ok: false; reason: string }> {
  const tk = o.account.user_oauth_tokens;
  if (!tk?.access_token) return { ok: false, reason: "sem_access_token" };
  const expired = tk.token_expiry && new Date(tk.token_expiry).getTime() < Date.now() + 60_000;
  if (!expired) return { ok: true, accessToken: tk.access_token };
  if (!tk.refresh_token) return { ok: false, reason: "sem_refresh_token" };

  try {
    const resp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: o.clientId,
        client_secret: o.clientSecret,
        refresh_token: tk.refresh_token,
        grant_type: "refresh_token",
      }),
    });
    if (!resp.ok) {
      const txt = await resp.text();
      return { ok: false, reason: `refresh_${resp.status}:${txt.slice(0, 80)}` };
    }
    const tokens = await resp.json();
    if (!tokens.access_token) return { ok: false, reason: "refresh_sem_access_token" };
    if (o.account.oauth_token_id) {
      await o.admin.from("user_oauth_tokens").update({
        access_token: tokens.access_token,
        token_expiry: new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString(),
        needs_reauth: false,
        reauth_reason: null,
        reauth_flagged_at: null,
        ...(tokens.refresh_token && { refresh_token: tokens.refresh_token }),
      }).eq("id", o.account.oauth_token_id);
    }
    return { ok: true, accessToken: tokens.access_token };
  } catch (e) {
    return { ok: false, reason: `refresh_exception:${e instanceof Error ? e.message : String(e)}` };
  }
}

async function pauseJobForReauth(
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
