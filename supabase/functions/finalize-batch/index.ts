// ============================================
// Edge Function: finalize-batch (Fase 5 do PLAN_HARDENING)
// Worker stateless: pega 5 invoices em ('extracted','review') sem
// drive_file_id (lock 180s via pick_invoices_for_finalize), corre o
// helper finalizeInvoice (dedup → Drive folders → upload → Sheets append
// → cleanup Storage). Após finalize:
//   - era 'extracted' → status='inbox' (estado terminal user-facing)
//   - era 'review'   → mantém 'review' (drive_file_id setado distingue
//                       "infra terminou" de "infra pendente")
//
// Idempotência: finalizeInvoice verifica drive_file_id no início; chamadas
// repetidas devolvem already_done. O lock optimista impede duas chamadas
// paralelas começarem antes de qualquer escrever drive_file_id.
//
// Concorrência: watchdog dispara 5×/min via generate_series. 5 workers
// paralelos × 1 finalize/15-25s = ~15 finalize/min ≪ 100/min Drive.
// ============================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { logEdgeError } from "../_shared/logError.ts";
import { finalizeInvoice } from "../_shared/finalizeInvoice.ts";

const BATCH_SIZE = 5;
const LOCK_SECONDS = 180;

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

  let body: { sync_job_id?: string } = {};
  try { body = await req.json(); } catch { /* corpo vazio ok */ }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const { data: pickedRaw, error: pickErr } = await admin.rpc(
    "pick_invoices_for_finalize",
    { p_limit: BATCH_SIZE, p_lock_seconds: LOCK_SECONDS },
  );

  if (pickErr) {
    await logEdgeError({
      functionName: "finalize-batch",
      level: "error",
      message: "pick_invoices_for_finalize falhou",
      metadata: { db_error: pickErr.message, sync_job_id: body.sync_job_id },
    });
    return json(500, { error: pickErr.message }, corsHeaders);
  }

  const picked = (pickedRaw ?? []) as Array<PickedInvoice>;
  if (picked.length === 0) {
    return json(200, { ok: true, processed: 0 }, corsHeaders);
  }

  // sync_jobs cancelados — soft-delete em vez de finalizar (poupar Drive ops)
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
  let alreadyDoneCount = 0;
  let failedCount = 0;
  let cancelledCount = 0;
  const updatedJobIds = new Set<string>();
  const stagesFailed: Record<string, number> = {};

  for (const item of picked) {
    if (item.sync_job_id) updatedJobIds.add(item.sync_job_id);

    if (item.sync_job_id && cancelledJobs.has(item.sync_job_id)) {
      await admin.from("invoices").update({
        status: "failed",
        review_reason: "sync_job_cancelled",
        deleted_at: new Date().toISOString(),
        locked_until: null,
      }).eq("id", item.id);
      cancelledCount++;
      continue;
    }

    const wasExtracted = item.status === "extracted";

    try {
      const result = await finalizeInvoice(item.id, admin, {
        deleteStorageAfterDrive: true,
      });

      if (result.ok) {
        if (result.already_done) {
          // finalizeInvoice já tinha corrido para esta invoice (race com
          // reprocess-pending ou self-trigger duplicado). Status já é o
          // final — só limpamos o lock para sair do filtro do pickup.
          await admin.from("invoices").update({ locked_until: null }).eq("id", item.id);
          alreadyDoneCount++;
          continue;
        }
        if (wasExtracted) {
          // Transição final: 'extracted' → 'inbox'. .eq('status','extracted')
          // protege contra sobrepor um 'review' que o finalizeInvoice tenha
          // posto via validateMontants (IVA inconsistente, etc.). Trigger
          // trg_invoices_reset_attempts limpa locked_until/attempts/next_retry_at
          // ao mudar status; se WHERE não match (status já é 'review'),
          // limpamos o lock explicitamente abaixo.
          await admin.from("invoices")
            .update({ status: "inbox" })
            .eq("id", item.id)
            .eq("status", "extracted");
        }
        // Garante lock limpo em ambos os caminhos (era extracted mas finalize
        // mudou para review; OU era review e finalize re-escreveu review com
        // mesmo valor — trigger não reseta porque IS DISTINCT FROM é false).
        await admin.from("invoices")
          .update({ locked_until: null })
          .eq("id", item.id)
          .not("locked_until", "is", null);
        okCount++;
      } else {
        // Falha lógica do finalize (no_companies, no_token, drive_upload, etc).
        // finalizeInvoice pode ter chamado markReason internamente, mudando
        // status='extracted' → 'review' (trigger reset attempts=0, lock=null).
        // Bump condicional: WHERE status=item.status só match se finalize NÃO
        // mudou status — protege contra sobrepor o reset do trigger e queimar
        // 2 retries indevidos. Se finalize mudou status, attempts já é 0 e o
        // próximo pickup arranca fresh (trigger fez o trabalho).
        const stage = result.stage || "unknown";
        stagesFailed[stage] = (stagesFailed[stage] || 0) + 1;
        await admin.from("invoices").update({
          attempts: item.attempts + 1,
          locked_until: null,
          last_error: `${stage}:${(result.reason ?? "").slice(0, 120)}`,
        }).eq("id", item.id).eq("status", item.status);
        // Garante lock limpo no caso em que finalize mudou status (WHERE acima
        // não match). Trigger já limpou se status mudou, mas é defensivo.
        await admin.from("invoices")
          .update({ locked_until: null })
          .eq("id", item.id)
          .not("locked_until", "is", null);
        failedCount++;
      }
    } catch (e) {
      // Excepção não capturada (rede, timeout). Status não mudou (excepção
      // antes de qualquer UPDATE). Bump attempts directo.
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[finalize-batch] invoice=${item.id} excepção`, msg);
      await admin.from("invoices").update({
        attempts: item.attempts + 1,
        locked_until: null,
        last_error: msg.slice(0, 200),
      }).eq("id", item.id).eq("status", item.status);
      failedCount++;
    }
  }

  // Heartbeat + counters
  for (const jobId of updatedJobIds) {
    const counts = await snapshotCountsByStatus(admin, jobId);
    await admin.from("sync_jobs").update({
      counts_by_status: counts,
      last_heartbeat_at: new Date().toISOString(),
    }).eq("id", jobId);
  }

  // Self-trigger: drena enquanto há trabalho. Filtro espelha o do RPC
  // pick_invoices_for_finalize.
  const { count: remaining } = await admin
    .from("invoices")
    .select("id", { count: "exact", head: true })
    .in("status", ["extracted", "review"])
    .is("deleted_at", null)
    .is("drive_file_id", null)
    .not("storage_path", "is", null)
    .lt("attempts", 3);

  if ((remaining ?? 0) > 0) {
    await admin.rpc("trigger_sync_worker", {
      p_function: "finalize-batch",
      p_body: {},
    });
  }

  const elapsed = Date.now() - t0;
  console.log(
    `[finalize-batch] batch elapsed=${elapsed}ms picked=${picked.length} ` +
    `ok=${okCount} already=${alreadyDoneCount} failed=${failedCount} ` +
    `cancelled=${cancelledCount} stages=${JSON.stringify(stagesFailed)} ` +
    `remaining=${remaining ?? "?"}`,
  );

  return json(200, {
    ok: true,
    processed: picked.length,
    ok_count: okCount,
    already_done: alreadyDoneCount,
    failed: failedCount,
    cancelled: cancelledCount,
    stages_failed: stagesFailed,
    remaining: remaining ?? null,
  }, corsHeaders);
});

// ─────────────────────────────────────────────────────────────────────────────

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
