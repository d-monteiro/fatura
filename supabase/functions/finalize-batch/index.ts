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
  bumpAttempt,
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
  const updatedJobIds = new Set<string>();
  const stagesFailed: Record<string, number> = {};

  for (const item of picked) {
    if (item.sync_job_id) updatedJobIds.add(item.sync_job_id);

    if (item.sync_job_id && cancelledJobs.has(item.sync_job_id)) {
      await markCancelled(admin, item.id);
      stagesFailed["cancelled"] = (stagesFailed["cancelled"] || 0) + 1;
      cancelledCount++;
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
        // Bump atómico + backoff. RPC WHERE status=expected: se finalizeInvoice
        // mudou status (markReason → 'review'), trigger já resetou attempts/
        // lock e RPC vira no-op. Se não mudou, RPC bumpa.
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
        // finalizeInvoice já tinha corrido (race com legacy reprocess-pending
        // ou self-trigger duplicado). Só limpa o lock para sair do filtro pickup.
        await admin.from("invoices").update({ locked_until: null }).eq("id", item.id);
        stagesFailed["already_done"] = (stagesFailed["already_done"] || 0) + 1;
        alreadyDoneCount++;
        continue;
      }

      if (wasExtracted) {
        // Transição final extracted→inbox. eq('status','extracted') protege
        // contra sobrepor 'review' que finalizeInvoice tenha posto via
        // validateMontants.
        await admin.from("invoices")
          .update({ status: "inbox", locked_until: null })
          .eq("id", item.id)
          .eq("status", "extracted");
      } else {
        // Era 'review' que ficou pendente de Drive. Drive ok, lock liberta.
        await admin.from("invoices")
          .update({ locked_until: null })
          .eq("id", item.id)
          .eq("status", "review");
      }
      okCount++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[finalize-batch] invoice=${item.id} excepção`, msg);
      stagesFailed["exception"] = (stagesFailed["exception"] || 0) + 1;
      await bumpAttempt(
        admin,
        item.id,
        item.status,
        msg.slice(0, 200),
        backoffDelay(item.attempts + 1),
      );
      failedCount++;
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
