// Worker stateless: pega N invoices em ('extracted','review') sem
// drive_file_id, corre finalizeInvoice (Drive folders + upload + Sheet
// append + cleanup Storage). Self-trigger se há mais.
//
// Decisão de design: 'extracted' → 'inbox' (não 'completed' como o plano
// sugere) por compat com a UI legacy que filtra por status='inbox'. A
// distinção "infra terminou" vs "humano ainda a rever" passa a ser via
// drive_file_id IS (NOT) NULL para items em 'review'.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { finalizeInvoice } from "../_shared/finalizeInvoice.ts";
import {
  backoffDelay,
  BreakerSuccessOnce,
  bumpAttempt,
  circuitBreakerCheck,
  circuitBreakerTrip,
  classifyFailure,
  isWorkerAuthorized,
  jsonResponse,
  logBatchSummary,
  logEdgeError,
  makeAdmin,
  markCancelled,
  readJsonBody,
  readWorkerEnv,
  refreshSyncJobCounts,
  triggerSyncWorker,
  type SupabaseAdmin,
} from "../_shared/syncWorkers.ts";

// Stages que indicam falha do serviço Drive (vs falha de dados/setup local)
const DRIVE_STAGES = new Set(["drive_folders", "drive_upload"]);

const BATCH_SIZE = 2;
const LOCK_SECONDS = 90;

interface PickedInvoice {
  id: string;
  tenant_id: string;
  user_id: string | null;
  status: string;
  sync_job_id: string | null;
  attempts: number;
  storage_path: string | null;
  drive_file_id: string | null;
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

  await readJsonBody<{ sync_job_id?: string }>(req);

  const admin = makeAdmin(env);

  // Pre-pickup só verifica breaker GLOBAL — per-tenant é item-a-item.
  const driveGlobalAllowed = await circuitBreakerCheck(admin, "drive", null);
  if (!driveGlobalAllowed) {
    logBatchSummary("finalize-batch", { elapsed_ms: Date.now() - t0, paused: "drive_global_breaker_open" });
    return jsonResponse(200, { ok: true, paused: true, reason: "drive_global_breaker_open" }, corsHeaders);
  }

  const { data: pickedRaw, error: pickErr } = await admin.rpc(
    "pick_invoices_for_finalize",
    { p_limit: BATCH_SIZE, p_lock_seconds: LOCK_SECONDS },
  );

  if (pickErr) {
    await logEdgeError({
      functionName: "finalize-batch",
      level: "error",
      message: "pick_invoices_for_finalize falhou",
      metadata: { db_error: pickErr.message },
    });
    return jsonResponse(500, { error: pickErr.message }, corsHeaders);
  }

  const picked = (pickedRaw ?? []) as Array<PickedInvoice>;
  if (picked.length === 0) {
    return jsonResponse(200, { ok: true, processed: 0 }, corsHeaders);
  }

  const syncJobIds = Array.from(new Set(
    picked.map((p) => p.sync_job_id).filter((v): v is string => !!v),
  ));
  const cancelledJobs = await loadCancelledJobIds(admin, syncJobIds);

  let okCount = 0;
  let alreadyDoneCount = 0;
  let failedCount = 0;
  let cancelledCount = 0;
  let timeoutCount = 0;
  const updatedJobIds = new Set<string>();
  const stagesFailed: Record<string, number> = {};
  const successOnce = new BreakerSuccessOnce(admin, "drive");

  for (const item of picked) {
    if (item.sync_job_id) updatedJobIds.add(item.sync_job_id);

    if (item.sync_job_id && cancelledJobs.has(item.sync_job_id)) {
      await markCancelled(admin, item.id);
      stagesFailed["cancelled"] = (stagesFailed["cancelled"] || 0) + 1;
      cancelledCount++;
      continue;
    }

    // Per-tenant breaker: se Drive deste tenant tem 5xx em série (e.g. perms
    // do utilizador revogadas), não trabalha mais este item neste batch.
    const tenantAllowed = await circuitBreakerCheck(admin, "drive", item.tenant_id);
    if (!tenantAllowed) {
      await admin.from("invoices")
        .update({ locked_until: null, next_retry_at: new Date(Date.now() + 60_000).toISOString() })
        .eq("id", item.id);
      stagesFailed["tenant_breaker_open"] = (stagesFailed["tenant_breaker_open"] || 0) + 1;
      continue;
    }

    const wasExtracted = item.status === "extracted";

    try {
      const result = await finalizeInvoice(item.id, admin, {
        deleteStorageAfterDrive: true,
      });

      if (!result.ok) {
        const stage = result.stage || "unknown";
        stagesFailed[stage] = (stagesFailed[stage] || 0) + 1;
        // Stages Drive → trip per-tenant. Outras stages (load_invoice,
        // no_gemini_data) são problemas locais e não tocam o breaker.
        if (DRIVE_STAGES.has(stage)) {
          await circuitBreakerTrip(admin, "drive", `${stage}:${(result.reason ?? "").slice(0, 80)}`, item.tenant_id);
        }
        await bumpAttempt(
          admin,
          item.id,
          item.status,
          `${stage}:${(result.reason ?? "").slice(0, 120)}`,
          backoffDelay(item.attempts + 1),
        );
        failedCount++;
        continue;
      }

      if (result.already_done) {
        await admin.from("invoices").update({ locked_until: null }).eq("id", item.id);
        stagesFailed["already_done"] = (stagesFailed["already_done"] || 0) + 1;
        alreadyDoneCount++;
        continue;
      }

      if (wasExtracted) {
        await admin.from("invoices")
          .update({ status: "inbox", locked_until: null })
          .eq("id", item.id)
          .eq("status", "extracted");
      } else {
        await admin.from("invoices")
          .update({ locked_until: null })
          .eq("id", item.id)
          .eq("status", "review");
      }
      await successOnce.report(item.tenant_id);
      okCount++;
    } catch (e) {
      // Classificar (review B4): timeout vs serviço down vs bug interno.
      const cls = classifyFailure(e);
      console.error(`[finalize-batch] invoice=${item.id} ${cls.kind}: ${cls.reason}`);
      stagesFailed[`exception_${cls.kind}`] = (stagesFailed[`exception_${cls.kind}`] || 0) + 1;
      if (cls.kind === "service") {
        await circuitBreakerTrip(admin, "drive", cls.reason, item.tenant_id);
      }
      await bumpAttempt(
        admin,
        item.id,
        item.status,
        `${cls.kind}:${cls.reason.slice(0, 180)}`,
        backoffDelay(item.attempts + 1),
      );
      if (cls.kind === "timeout") timeoutCount++;
      else failedCount++;
    }
  }

  for (const jobId of updatedJobIds) {
    await refreshSyncJobCounts(admin, jobId);
  }

  const { data: hasMore } = await admin.rpc("has_pickable_invoices_for_finalize");
  if (hasMore === true) {
    await triggerSyncWorker(admin, "finalize-batch");
  }

  logBatchSummary("finalize-batch", {
    elapsed_ms: Date.now() - t0,
    picked: picked.length,
    ok: okCount,
    already: alreadyDoneCount,
    failed: failedCount,
    timeouts: timeoutCount,
    cancelled: cancelledCount,
    stages: JSON.stringify(stagesFailed),
    more: hasMore === true ? "yes" : "no",
  });

  return jsonResponse(200, {
    ok: true,
    processed: picked.length,
    ok_count: okCount,
    already_done: alreadyDoneCount,
    failed: failedCount,
    timeouts: timeoutCount,
    cancelled: cancelledCount,
    stages_failed: stagesFailed,
    more: hasMore === true,
  }, corsHeaders);
});

async function loadCancelledJobIds(
  admin: SupabaseAdmin,
  jobIds: string[],
): Promise<Set<string>> {
  if (jobIds.length === 0) return new Set();
  const { data } = await admin
    .from("sync_jobs")
    .select("id, status")
    .in("id", jobIds);
  const out = new Set<string>();
  for (const j of (data ?? []) as Array<{ id: string; status: string }>) {
    if (j.status === "cancelled" || j.status === "error") out.add(j.id);
  }
  return out;
}
