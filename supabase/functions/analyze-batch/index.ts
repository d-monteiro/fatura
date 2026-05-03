// Worker stateless: pega N invoices em status='analyzing', chama
// analyze-document com skip_finalize=true. Self-trigger se há mais; senão
// dispara finalize-batch. Concorrência de Gemini é limitada via watchdog
// (5 workers/min) + processamento sequencial dentro do worker.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
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
const LOCK_SECONDS = 60;
const ANALYZE_TIMEOUT_MS = 25_000;

interface PickedInvoice {
  id: string;
  tenant_id: string;
  user_id: string | null;
  company_id: string | null;
  email_message_id: string | null;
  sync_job_id: string | null;
  status: string;
  attempts: number;
  storage_path: string | null;
}

type AnalyzeState = "extracted" | "review" | "rejected" | "inbox";

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
    "pick_invoices_for_processing",
    { p_status: "analyzing", p_limit: BATCH_SIZE, p_lock_seconds: LOCK_SECONDS },
  );

  if (pickErr) {
    await logEdgeError({
      functionName: "analyze-batch",
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

  const syncJobIds = Array.from(new Set(
    picked.map((p) => p.sync_job_id).filter((v): v is string => !!v),
  ));
  const cancelledJobs = await loadCancelledJobIds(admin, syncJobIds);

  let okCount = 0;
  let reviewCount = 0;
  let rejectedCount = 0;
  let cancelledCount = 0;
  let errorCount = 0;
  let rateLimitedCount = 0;
  const updatedJobIds = new Set<string>();

  for (const item of picked) {
    if (item.sync_job_id) updatedJobIds.add(item.sync_job_id);

    if (item.sync_job_id && cancelledJobs.has(item.sync_job_id)) {
      await markCancelled(admin, item.id);
      cancelledCount++;
      continue;
    }

    try {
      const resp = await fetchWithTimeout(
        `${env.supabaseUrl}/functions/v1/analyze-document`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-internal-secret": env.serviceKey,
          },
          body: JSON.stringify({ invoice_id: item.id, skip_finalize: true }),
        },
        ANALYZE_TIMEOUT_MS,
      );

      if (resp.status === 429) {
        // Throttle global Gemini — backoff 60s, larga lock. Não conta como
        // attempt: não é falha do item.
        await admin.from("invoices").update({
          locked_until: null,
          next_retry_at: new Date(Date.now() + 60_000).toISOString(),
          last_error: "gemini_429",
        }).eq("id", item.id).eq("status", "analyzing");
        rateLimitedCount++;
        continue;
      }

      if (!resp.ok) {
        const txt = await resp.text().catch(() => "");
        // 5xx: status não mudou. bumpAttempt + backoff exponencial.
        // 4xx: analyze-document fez markFailed → status mudou → RPC
        //      WHERE status='analyzing' não match → no-op. OK.
        await bumpAttempt(
          admin,
          item.id,
          "analyzing",
          `analyze_${resp.status}:${txt.slice(0, 60)}`,
          backoffDelay(item.attempts + 1),
        );
        errorCount++;
        continue;
      }

      const payload = await resp.json().catch(() => ({})) as { state?: string };
      switch (payload.state as AnalyzeState | undefined) {
        case "extracted": okCount++; break;
        case "review": reviewCount++; break;
        case "rejected": rejectedCount++; break;
        case "inbox": okCount++; break;
        default:
          await logEdgeError({
            functionName: "analyze-batch",
            level: "warn",
            message: "analyze-document devolveu state desconhecido",
            tenantId: item.tenant_id,
            metadata: { invoice_id: item.id, state: payload.state ?? null },
          });
          errorCount++;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[analyze-batch] invoice=${item.id} excepção`, msg);
      await bumpAttempt(
        admin,
        item.id,
        "analyzing",
        msg.slice(0, 200),
        backoffDelay(item.attempts + 1),
      );
      errorCount++;
    }
  }

  for (const jobId of updatedJobIds) {
    await refreshSyncJobCounts(admin, jobId);
  }

  const { data: hasMoreAnalyzing } = await admin.rpc(
    "has_pickable_invoices_for_processing",
    { p_status: "analyzing" },
  );

  if (hasMoreAnalyzing === true) {
    await triggerSyncWorker(admin, "analyze-batch");
  } else {
    const { data: hasFinalize } = await admin.rpc("has_pickable_invoices_for_finalize");
    if (hasFinalize === true) {
      await triggerSyncWorker(admin, "finalize-batch");
    }
  }

  logBatchSummary("analyze-batch", {
    elapsed_ms: Date.now() - t0,
    picked: picked.length,
    ok: okCount,
    review: reviewCount,
    rejected: rejectedCount,
    cancelled: cancelledCount,
    errors: errorCount,
    rate_limited: rateLimitedCount,
    more_analyzing: hasMoreAnalyzing === true ? "yes" : "no",
  });

  return jsonResponse(200, {
    ok: true,
    processed: picked.length,
    ok_count: okCount,
    review: reviewCount,
    rejected: rejectedCount,
    cancelled: cancelledCount,
    errors: errorCount,
    rate_limited: rateLimitedCount,
    more_analyzing: hasMoreAnalyzing === true,
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

function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timeoutId));
}
