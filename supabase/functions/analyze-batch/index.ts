// Worker stateless: pega N invoices em status='analyzing', chama
// analyze-document com skip_finalize=true. Self-trigger se há mais; senão
// dispara finalize-batch. Concorrência de Gemini é limitada via watchdog
// (5 workers/min) + processamento sequencial dentro do worker.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
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

// BATCH_SIZE=2 (não 5 como o plano sugere): cada Gemini ≈10s; 5 sequenciais
// passam o wall do edge runtime + buffer de logging. Watchdog dispara 5×/min
// pelo que throughput agregado fica em ~10/min, suficiente para o caso médio.
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

  // Pre-pickup: só verifica breaker GLOBAL aqui (sem item.tenant_id ainda).
  // Per-tenant é verificado item-a-item depois do pickup. Watchdog (review S1)
  // já filtra esta call quando há global open — chegamos cá só se vale a pena.
  const geminiGlobalAllowed = await circuitBreakerCheck(admin, "gemini", null);
  if (!geminiGlobalAllowed) {
    logBatchSummary("analyze-batch", { elapsed_ms: Date.now() - t0, paused: "gemini_global_breaker_open" });
    return jsonResponse(200, { ok: true, paused: true, reason: "gemini_global_breaker_open" }, corsHeaders);
  }

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
  let timeoutCount = 0;
  let rateLimitedCount = 0;
  const updatedJobIds = new Set<string>();
  const successOnce = new BreakerSuccessOnce(admin, "gemini");

  for (const item of picked) {
    if (item.sync_job_id) updatedJobIds.add(item.sync_job_id);

    if (item.sync_job_id && cancelledJobs.has(item.sync_job_id)) {
      await markCancelled(admin, item.id);
      cancelledCount++;
      continue;
    }

    // Per-tenant breaker check pós-pickup. Se este tenant tem 5xx em série,
    // larga o lock e segue: outro tenant ainda pode estar saudável.
    const tenantAllowed = await circuitBreakerCheck(admin, "gemini", item.tenant_id);
    if (!tenantAllowed) {
      await admin.from("invoices")
        .update({ locked_until: null, next_retry_at: new Date(Date.now() + 60_000).toISOString() })
        .eq("id", item.id).eq("status", "analyzing");
      rateLimitedCount++;
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
        // 429 é rate-limit da API → trip GLOBAL (afecta todos os tenants).
        // Larga lock + next_retry sem queimar attempt.
        await admin.from("invoices").update({
          locked_until: null,
          next_retry_at: new Date(Date.now() + 60_000).toISOString(),
          last_error: "gemini_429",
        }).eq("id", item.id).eq("status", "analyzing");
        await circuitBreakerTrip(admin, "gemini", "gemini_429", null);
        rateLimitedCount++;
        continue;
      }

      if (!resp.ok) {
        const txt = await resp.text().catch(() => "");
        // 5xx do analyze-document = problema upstream Gemini ou auth/permissão
        // específicos do tenant → trip PER-TENANT. 4xx = analyze-document já
        // marcou o item; status mudou e o bump fica no-op (proteção do RPC).
        if (resp.status >= 500) {
          await circuitBreakerTrip(admin, "gemini", `gemini_${resp.status}`, item.tenant_id);
        }
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

      // Sucesso: fecha breaker per-tenant E global se estavam half_open. 1× por batch.
      await successOnce.report(item.tenant_id);

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
      // Classificar (review B4): timeout vs serviço down vs bug interno.
      const cls = classifyFailure(e);
      console.error(`[analyze-batch] invoice=${item.id} ${cls.kind}: ${cls.reason}`);
      if (cls.kind === "service") {
        // Trip per-tenant (não global) — outros tenants podem estar OK
        await circuitBreakerTrip(admin, "gemini", cls.reason, item.tenant_id);
      }
      // Em timeout/internal não tripamos breaker (review B4): timeout pode ser
      // só latência elevada; internal é bug local. Mas bumpAttempt sempre,
      // para o budget de 3 attempts proteger contra loops.
      await bumpAttempt(
        admin,
        item.id,
        "analyzing",
        `${cls.kind}:${cls.reason.slice(0, 180)}`,
        backoffDelay(item.attempts + 1),
      );
      if (cls.kind === "timeout") timeoutCount++;
      else errorCount++;
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
    timeouts: timeoutCount,
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
    timeouts: timeoutCount,
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
