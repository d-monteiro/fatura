// ============================================
// Edge Function: analyze-batch (Fase 4 do PLAN_HARDENING)
// Worker stateless: pega 5 invoices status='analyzing' (lock 150s via
// pick_invoices_for_processing), chama analyze-document por cada com
// skip_finalize=true. analyze-document marca status='extracted' (Gemini ok),
// 'review' (needs review) ou 'failed' (erro permanente). O lock liberta
// automaticamente porque o trigger trg_invoices_reset_attempts limpa
// locked_until em qualquer mudança de status.
//
// Self-trigger se ainda há analyzing livres. Quando esgota, dispara
// finalize-batch para drenar 'extracted'/'review'.
//
// Concorrência: watchdog dispara 5×/min via generate_series. Cada worker
// processa sequencialmente (1 invoice de cada vez, ~5s/Gemini call) para
// que 5 workers paralelos × 1/5s = 60 calls/min — encaixa exactamente no
// limite Gemini sem precisar de token bucket.
// ============================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { logEdgeError } from "../_shared/logError.ts";

const BATCH_SIZE = 5;
const LOCK_SECONDS = 150;
const ANALYZE_TIMEOUT_MS = 130_000;

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" }, corsHeaders);

  const t0 = Date.now();
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const cronSecret = Deno.env.get("CRON_SECRET") || "";

  const cronHeader = req.headers.get("x-cron-secret");
  const internalHeader = req.headers.get("x-internal-secret");
  const isAuthorized =
    (!!cronSecret && cronHeader === cronSecret) ||
    (!!internalHeader && internalHeader === serviceKey);
  if (!isAuthorized) return json(401, { error: "Unauthorized" }, corsHeaders);

  // sync_job_id é meramente informativo aqui — o pick é global por status.
  // O watchdog passa {} e o worker drena qualquer 'analyzing'.
  let body: { sync_job_id?: string } = {};
  try { body = await req.json(); } catch { /* corpo vazio é OK */ }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const { data: pickedRaw, error: pickErr } = await admin.rpc(
    "pick_invoices_for_processing",
    { p_status: "analyzing", p_limit: BATCH_SIZE, p_lock_seconds: LOCK_SECONDS },
  );

  if (pickErr) {
    await logEdgeError({
      functionName: "analyze-batch",
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

  // Carrega sync_jobs envolvidos para detectar cancelamentos a meio do batch
  const syncJobIds = Array.from(new Set(
    picked.map((p) => p.sync_job_id).filter((v): v is string => !!v),
  ));
  const cancelledJobs = new Set<string>();
  if (syncJobIds.length > 0) {
    const { data: jobs } = await admin
      .from("sync_jobs")
      .select("id, status")
      .in("id", syncJobIds);
    for (const j of (jobs ?? []) as Array<{ id: string; status: string }>) {
      if (j.status === "cancelled" || j.status === "error") cancelledJobs.add(j.id);
    }
  }

  let okCount = 0;
  let reviewCount = 0;
  let rejectedCount = 0;
  let errorCount = 0;
  let rateLimitedCount = 0;
  const updatedJobIds = new Set<string>();

  // Processamento sequencial dentro do worker. 5 workers paralelos cada um
  // a fazer 1 Gemini call/5s ⇒ ~60/min agregado. Concorrência interna
  // multiplicaria isso e estouraria o limite.
  for (const item of picked) {
    if (item.sync_job_id) updatedJobIds.add(item.sync_job_id);

    if (item.sync_job_id && cancelledJobs.has(item.sync_job_id)) {
      // User cancelou ou o job entrou em erro. Soft-delete + liberta lock.
      await admin.from("invoices").update({
        status: "failed",
        review_reason: "sync_job_cancelled",
        deleted_at: new Date().toISOString(),
        locked_until: null,
      }).eq("id", item.id);
      rejectedCount++;
      continue;
    }

    try {
      const resp = await fetchWithTimeout(
        `${supabaseUrl}/functions/v1/analyze-document`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-internal-secret": serviceKey,
          },
          body: JSON.stringify({ invoice_id: item.id, skip_finalize: true }),
        },
        ANALYZE_TIMEOUT_MS,
      );

      if (!resp.ok) {
        const status = resp.status;
        const txt = await resp.text().catch(() => "");

        if (status === 429) {
          // Gemini rate limited — backoff 60s, liberta lock para retry
          rateLimitedCount++;
          await admin.from("invoices").update({
            locked_until: null,
            next_retry_at: new Date(Date.now() + 60_000).toISOString(),
            last_error: "gemini_429",
          }).eq("id", item.id);
          // Não conta como attempt: bumping attempts tinha de ser explícito
          // (worker death não queima budget — ver C2 phase1_hardening_review).
          // Aqui também não é falha lógica do item, é throttle global.
          continue;
        }

        if (status >= 500) {
          // Erro transitório Edge runtime (cold-start, 503, etc.). Bump
          // condicional: se analyze-document chegou a chamar markFailed
          // internamente e o status mudou para 'failed', trigger já resetou
          // attempts/lock. WHERE status=item.status protege contra sobrepor.
          await admin.from("invoices").update({
            attempts: item.attempts + 1,
            locked_until: null,
            last_error: `analyze_${status}:${txt.slice(0, 60)}`,
          }).eq("id", item.id).eq("status", item.status);
          // Defensivo: se status mudou (markFailed) o trigger limpou lock.
          // Senão, o UPDATE acima limpou. Esta segunda UPDATE só corre se
          // ainda houver lock pendurado — caso patológico.
          await admin.from("invoices")
            .update({ locked_until: null })
            .eq("id", item.id)
            .not("locked_until", "is", null);
          errorCount++;
          continue;
        }

        // 4xx: analyze-document já fez markFailed. Lock liberta via trigger
        // (status mudou). Conta como erro lógico.
        errorCount++;
        continue;
      }

      // 200: analyze-document fez UPDATE da invoice (status='extracted'/
      // 'review'/'failed'). O trigger trg_invoices_reset_attempts limpa
      // locked_until na mudança de status. Aqui só contabilizamos.
      const payload = await resp.json().catch(() => ({} as Record<string, unknown>));
      const state = payload?.state;
      if (state === "extracted") okCount++;
      else if (state === "review") reviewCount++;
      else if (state === "rejected") rejectedCount++;
      else okCount++; // fallback
    } catch (e) {
      // Timeout/network — incrementa attempts, larga lock, deixa para retry.
      // Status mantém-se 'analyzing' (excepção antes de o servidor escrever).
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[analyze-batch] invoice=${item.id} excepção`, msg);
      await admin.from("invoices").update({
        attempts: item.attempts + 1,
        locked_until: null,
        last_error: msg.slice(0, 200),
      }).eq("id", item.id).eq("status", item.status);
      errorCount++;
    }
  }

  // Heartbeat + counters por sync_job
  for (const jobId of updatedJobIds) {
    const counts = await snapshotCountsByStatus(admin, jobId);
    await admin.from("sync_jobs").update({
      counts_by_status: counts,
      last_heartbeat_at: new Date().toISOString(),
    }).eq("id", jobId);
  }

  // Self-trigger: drena queue de 'analyzing' enquanto há trabalho. SKIP LOCKED
  // garante que workers paralelos não duplicam — quando todos estão ocupados,
  // o pick devolve 0 e o worker termina.
  const { count: remainingAnalyzing } = await admin
    .from("invoices")
    .select("id", { count: "exact", head: true })
    .eq("status", "analyzing")
    .is("deleted_at", null)
    .lt("attempts", 3);

  if ((remainingAnalyzing ?? 0) > 0) {
    await admin.rpc("trigger_sync_worker", {
      p_function: "analyze-batch",
      p_body: {},
    });
  } else {
    // Esgotou 'analyzing' — dispara finalize-batch se há 'extracted'/'review'
    // ainda sem Drive (drenagem suave; o watchdog cobre se este disparo falhar)
    const { count: remainingFinalize } = await admin
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .in("status", ["extracted", "review"])
      .is("deleted_at", null)
      .is("drive_file_id", null)
      .not("storage_path", "is", null)
      .lt("attempts", 3);
    if ((remainingFinalize ?? 0) > 0) {
      await admin.rpc("trigger_sync_worker", {
        p_function: "finalize-batch",
        p_body: {},
      });
    }
  }

  const elapsed = Date.now() - t0;
  console.log(
    `[analyze-batch] batch elapsed=${elapsed}ms picked=${picked.length} ` +
    `ok=${okCount} review=${reviewCount} rejected=${rejectedCount} ` +
    `errors=${errorCount} rate_limited=${rateLimitedCount} ` +
    `remaining=${remainingAnalyzing ?? "?"}`,
  );

  return json(200, {
    ok: true,
    processed: picked.length,
    ok_count: okCount,
    review: reviewCount,
    rejected: rejectedCount,
    errors: errorCount,
    rate_limited: rateLimitedCount,
    remaining: remainingAnalyzing ?? null,
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
  storage_path: string | null;
}

function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timeoutId));
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
