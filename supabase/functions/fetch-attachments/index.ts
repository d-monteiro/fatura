// ============================================
// Edge Function: fetch-attachments (Fase 3 do PLAN_HARDENING — review)
// Worker stateless: pega N invoices status='discovered' (lock 90s via
// pick_invoices_for_processing), descarrega anexos do Gmail, faz upload
// para Storage, calcula sha256, e transita para 'analyzing'. Mensagens
// sem anexos válidos viram 'rejected' (soft delete).
//
// Multi-anexo: o stub criado pelo discover-emails é por *mensagem*. Aqui
// expandimos: o 1º anexo válido reaproveita a invoice existente (UPDATE),
// os restantes geram INSERTs novos com email_attachment_id próprio.
//
// Idempotência: lock optimista via locked_until (90s); collision por sha256
// vira a invoice em 'rejected'. Worker pode morrer a meio sem deixar
// ficheiros órfãos duplicados.
//
// Mudanças vs. versão original:
//   - NÃO faz update intermediate status='fetching' (preservava bug C1: o
//     trigger reset zerava locked_until em qualquer mudança de status).
//     Items ficam em 'discovered' enquanto têm o lock activo.
//   - Bumpa attempts via RPC bump_invoice_attempt em falha logical (C2).
//   - Distingue 401/403/404/429/5xx (S11).
//   - markCancelled (não markRejected) para sync_job_cancelled (S2).
//   - Multi-attachment INSERT propaga sync_run_id se existir (S10).
//   - refresh_sync_job_counts via RPC (S5).
// ============================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import {
  backoffDelay,
  bumpAttempt,
  ensureFreshToken,
  isWorkerAuthorized,
  jsonResponse,
  logBatchSummary,
  logEdgeError,
  makeAdmin,
  markCancelled,
  markFailedPermanent,
  markRejected,
  pauseSyncJobForReauth,
  readJsonBody,
  readWorkerEnv,
  refreshSyncJobCounts,
  releaseLock,
  triggerSyncWorker,
  type SupabaseAdmin,
} from "../_shared/syncWorkers.ts";

const BATCH_SIZE = 5;
const LOCK_SECONDS = 90;
const MIN_ATTACHMENT_BYTES = 5_000;
const MAX_BASE64_LEN = 8_000_000;
const MAX_PART_DEPTH = 12;
const ALLOWED_MIMES = new Set([
  "application/pdf",
  "application/x-pdf",
  "application/octet-stream",
  "image/jpeg",
  "image/jpg",
  "image/png",
]);
const ALLOWED_EXT_RE = /\.(pdf|jpe?g|png)$/i;

interface PickedInvoice {
  id: string;
  tenant_id: string;
  user_id: string | null;
  company_id: string;
  email_message_id: string | null;
  sync_job_id: string | null;
  sync_run_id: string | null;
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

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse(405, { error: "Method not allowed" }, corsHeaders);

  const t0 = Date.now();
  const env = readWorkerEnv();
  if (!isWorkerAuthorized(req, env)) {
    return jsonResponse(401, { error: "Unauthorized" }, corsHeaders);
  }

  await readJsonBody<{ sync_job_id?: string }>(req); // body é meramente informativo

  const admin = makeAdmin(env);

  // 1. Pega batch via pick_invoices_for_processing (FOR UPDATE SKIP LOCKED).
  // O lock optimista (locked_until=now()+90s) é o ÚNICO marcador de "em curso".
  // Status fica 'discovered' até transição terminal — sem update cosmético.
  const { data: pickedRaw, error: pickErr } = await admin.rpc(
    "pick_invoices_for_processing",
    { p_status: "discovered", p_limit: BATCH_SIZE, p_lock_seconds: LOCK_SECONDS },
  );

  if (pickErr) {
    await logEdgeError({
      functionName: "fetch-attachments",
      level: "error",
      message: "pick_invoices_for_processing falhou",
      metadata: { db_error: pickErr.message },
    });
    return jsonResponse(500, { error: pickErr.message }, corsHeaders);
  }

  const picked = (pickedRaw ?? []) as Array<PickedInvoice>;
  if (picked.length === 0) {
    return jsonResponse(200, { ok: true, processed: 0 }, corsHeaders);
  }

  // 2. Carregar sync_jobs e email_accounts em batch.
  const syncJobIds = Array.from(new Set(picked.map((p) => p.sync_job_id).filter((v): v is string => !!v)));
  let jobsById = new Map<string, JobRow>();
  if (syncJobIds.length > 0) {
    const { data: jobs } = await admin
      .from("sync_jobs")
      .select("id, email_account_id, tenant_id, user_id, status")
      .in("id", syncJobIds);
    jobsById = new Map(((jobs ?? []) as JobRow[]).map((j) => [j.id, j]));
  }

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

  const tokenCache = new Map<string, string>();

  let okCount = 0;
  let rejectedCount = 0;
  let cancelledCount = 0;
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

      // Cancelamento explícito do user → markCancelled (não rejected).
      if (job && (job.status === "cancelled" || job.status === "error")) {
        await markCancelled(admin, item.id);
        cancelledCount++;
        continue;
      }

      // Token (cache + refresh)
      const tk = await ensureFreshToken(
        admin,
        account,
        env.googleClientId,
        env.googleClientSecret,
        tokenCache,
      );
      if (!tk.ok) {
        if (job) {
          await pauseSyncJobForReauth(admin, job.id, account.oauth_token_id, tk.reason);
        }
        await releaseLock(admin, item.id, "discovered");
        errorCount++;
        continue;
      }

      const result = await processInvoice(item, account, tk.accessToken, admin);
      if (result === "ok") okCount++;
      else if (result === "rejected") rejectedCount++;
      else if (result === "cancelled") cancelledCount++;
      else errorCount++;
    } catch (e) {
      errorCount++;
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[fetch-attachments] invoice=${item.id} excepção`, msg);
      // Bump atómico — protege contra sobrepor reset do trigger se o status
      // já mudou entretanto.
      await bumpAttempt(
        admin,
        item.id,
        "discovered",
        msg.slice(0, 200),
        backoffDelay(item.attempts + 1),
      );
    }
  }

  // 3. Heartbeat + counters por sync_job (RPC GROUP BY)
  for (const jobId of updatedJobIds) {
    await refreshSyncJobCounts(admin, jobId);
  }

  // 4. Self-trigger se ainda há discovered livres.
  const { count: remaining } = await admin
    .from("invoices")
    .select("id", { count: "exact", head: true })
    .eq("status", "discovered")
    .is("deleted_at", null)
    .or("locked_until.is.null,locked_until.lt." + new Date().toISOString())
    .lt("attempts", 3);

  if ((remaining ?? 0) > 0) {
    await triggerSyncWorker(admin, "fetch-attachments");
  } else if (updatedJobIds.size > 0) {
    // Não há mais discovered. Marca jobs envolvidos como done se nenhum
    // bucket activo restante (otimização: o watchdog também faz, mas
    // isto poupa 1min de delay na UI).
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

  logBatchSummary("fetch-attachments", {
    elapsed_ms: Date.now() - t0,
    picked: picked.length,
    ok: okCount,
    rejected: rejectedCount,
    cancelled: cancelledCount,
    errors: errorCount,
    remaining: remaining ?? null,
  });

  return jsonResponse(200, {
    ok: true,
    processed: picked.length,
    ok_count: okCount,
    rejected: rejectedCount,
    cancelled: cancelledCount,
    errors: errorCount,
    remaining: remaining ?? null,
  }, corsHeaders);
});

// ─────────────────────────────────────────────────────────────────────────────

function flattenParts(parts: GmailPart[] | undefined, depth = 0): GmailPart[] {
  if (!parts?.length || depth > MAX_PART_DEPTH) return [];
  const out: GmailPart[] = [];
  for (const p of parts) {
    out.push(p);
    if (p.parts?.length) out.push(...flattenParts(p.parts, depth + 1));
  }
  return out;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

type ProcessResult = "ok" | "rejected" | "cancelled" | "error";

async function processInvoice(
  invoice: PickedInvoice,
  account: AccountRow,
  accessToken: string,
  admin: SupabaseAdmin,
): Promise<ProcessResult> {
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
    return await handleGmailError(msgResp, invoice, account, admin, "messages.get");
  }

  const msgData = await msgResp.json();
  const payload = msgData.payload as GmailPart | undefined;

  const rawHeaders = (payload && Array.isArray((payload as { headers?: Array<{ name?: string; value?: string }> }).headers))
    ? (payload as { headers: Array<{ name?: string; value?: string }> }).headers
    : [];
  const headerValue = (name: string): string | null => {
    const h = rawHeaders.find((x) => (x.name ?? "").toLowerCase() === name.toLowerCase());
    return h?.value?.slice(0, 500) ?? null;
  };
  const emailSubject = headerValue("Subject");
  const emailFrom = headerValue("From");
  const internalDateMs = Number(msgData.internalDate ?? 0);
  const emailReceivedAt = internalDateMs > 0 ? new Date(internalDateMs).toISOString() : null;

  const allParts = payload ? [payload, ...flattenParts(payload.parts)] : [];
  const candidates = allParts.filter((p) => p.filename && p.body?.attachmentId);

  // Filtra MIME + ext + size (sem download)
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

  // 2. Para cada anexo: download → hash → dedup → upload Storage.
  // 1.º vai para o stub original (UPDATE); restantes geram INSERTs novos.
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
        // 404: anexo apagado entre messages.get e attachments.get — skip
        // este anexo, segue para o próximo.
        if (attResp.status === 404) {
          lastError = `att_404`;
          continue;
        }
        // 401: token expirou no meio do batch (raro: cache + ensureFreshToken).
        // Sai do loop interno; caller bumpa attempts.
        if (attResp.status === 401) {
          lastError = `att_401`;
          break;
        }
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

      // Dedup por hash
      const { data: existingByHash } = await admin
        .from("invoices")
        .select("id")
        .eq("tenant_id", invoice.tenant_id)
        .eq("attachment_hash", hash)
        .neq("id", invoice.id)
        .limit(1);
      if (existingByHash && existingByHash.length > 0) {
        // Hash colidiu — duplicado. Se este é o anexo que ia ocupar o stub
        // original, marca rejected. Senão, skip silencioso.
        if (!firstAnexoConsumed) {
          await markRejected(admin, invoice.id, "duplicate_hash", {
            email_subject: emailSubject,
            email_from: emailFrom,
            email_received_at: emailReceivedAt,
          });
          firstAnexoConsumed = true;
        }
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
          upsert: true,
        });
      if (storageErr || !storageData?.path) {
        lastError = `storage_${storageErr?.message?.slice(0, 80) ?? "no_path"}`;
        continue;
      }

      const { data: signed } = await admin.storage
        .from("invoices")
        .createSignedUrl(storageData.path, 60 * 60 * 24 * 30);
      const fileUrl = signed?.signedUrl ?? null;

      if (!firstAnexoConsumed) {
        // Reaproveita stub original. Transição discovery→analyze: trigger
        // reset attempts/lock_release_count automaticamente. locked_until=null
        // explicit (worker controla 100% — trigger não toca).
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
          last_error: null,
        }).eq("id", invoice.id).eq("status", "discovered");

        if (updateErr) {
          lastError = `update_${updateErr.code}_${updateErr.message?.slice(0, 60)}`;
          await admin.storage.from("invoices").remove([storageData.path]).catch(() => null);
          continue;
        }
        firstAnexoConsumed = true;
        okOnAtLeastOne = true;
      } else {
        // Anexo extra: NOVA invoice, mesmo sync_job/sync_run. status='analyzing'
        // directo (não é stub, já tem ficheiro).
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
          sync_run_id: invoice.sync_run_id,
        });
        if (insertErr) {
          // 23505: race com hash ou com (msg_id, attachment_id). Limpa Storage
          // e segue.
          await admin.storage.from("invoices").remove([storageData.path]).catch(() => null);
          if (insertErr.code !== "23505") {
            lastError = `insert_extra_${insertErr.code}`;
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
    // Nenhum anexo conseguiu ocupar o stub. Se já esgotámos retries, falha
    // permanente. Senão, bump attempts via RPC atómica e retry.
    if (invoice.attempts + 1 >= 3) {
      await markFailedPermanent(admin, invoice.id, `fetch_failed:${lastError ?? "unknown"}`);
      return "rejected";
    }
    await bumpAttempt(
      admin,
      invoice.id,
      "discovered",
      lastError ?? "fetch_failed",
      backoffDelay(invoice.attempts + 1),
    );
    return "error";
  }

  return okOnAtLeastOne ? "ok" : "error";
}

async function handleGmailError(
  resp: Response,
  invoice: PickedInvoice,
  account: AccountRow,
  admin: SupabaseAdmin,
  context: string,
): Promise<ProcessResult> {
  const status = resp.status;
  const txt = await resp.text().catch(() => "");

  // 404: mensagem apagada do Gmail entre discover e fetch — terminal
  if (status === 404) {
    await markRejected(admin, invoice.id, "gmail_404");
    return "rejected";
  }
  // 401: token expirado mid-batch. Pausa job, larga lock.
  if (status === 401) {
    if (invoice.sync_job_id) {
      await pauseSyncJobForReauth(admin, invoice.sync_job_id, account.oauth_token_id, "gmail_401");
    }
    await releaseLock(admin, invoice.id, "discovered");
    return "error";
  }
  // 403: forbidden / insufficient scope — terminal sem retry
  if (status === 403) {
    await markFailedPermanent(admin, invoice.id, `gmail_403:${txt.slice(0, 120)}`);
    return "error";
  }
  // 429: rate limit. Larga lock + backoff longo.
  if (status === 429) {
    await admin.from("invoices").update({
      locked_until: null,
      next_retry_at: new Date(Date.now() + 60_000).toISOString(),
      last_error: `gmail_429:${context}`,
    }).eq("id", invoice.id).eq("status", "discovered");
    return "error";
  }
  // 5xx ou outros: bump attempts, próximo cron retoma.
  await bumpAttempt(
    admin,
    invoice.id,
    "discovered",
    `gmail_${status}:${context}:${txt.slice(0, 80)}`,
    backoffDelay(invoice.attempts + 1),
  );
  return "error";
}
