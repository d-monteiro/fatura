// ============================================
// Edge Function: reprocess-pending
// Completa o pipeline Drive+Sheets para invoices presas sem drive_file_id.
// Usado por:
//   - Cron (header x-cron-secret): todas invoices stuck > 5 min
//   - Admin UI (JWT + is_admin_global): invoice_ids explícitos ou do tenant
//   - User logado: só as suas próprias (scoped por user_id)
// Idempotente. Concorrência 3 para não saturar Drive.
// ============================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { logEdgeError } from "../_shared/logError.ts";
import { finalizeInvoice, type FinalizeResult } from "../_shared/finalizeInvoice.ts";

const MAX_PER_RUN = 50;
// 2 em vez de 3: boot concurrency do edge runtime devolvia 503 em bursts
const CONCURRENCY = 2;
const STUCK_SINCE_MINUTES = 5;
const ANALYZE_RETRY_DELAYS_MS = [1000, 3000, 8000];

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" }, corsHeaders);

  const runId = crypto.randomUUID();
  const t0 = Date.now();

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const cronSecret = Deno.env.get("CRON_SECRET") || "";

  const cronHeader = req.headers.get("x-cron-secret");
  const isCron = !!cronSecret && cronHeader === cronSecret;
  // Chamadas internas (sync-email pós fan-out) usam service role key
  const internalHeader = req.headers.get("x-internal-secret");
  const isInternal = !!internalHeader && internalHeader === serviceKey;

  let body: { invoice_ids?: string[]; tenant_id?: string; limit?: number } = {};
  try { body = await req.json(); } catch { /* body vazio é OK */ }

  // Auth: cron/internal OR admin OR user (último restrito a próprias invoices)
  let mode: "cron" | "admin" | "user" = "cron";
  let scopedUserId: string | null = null;

  if (!isCron && !isInternal) {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { error: "Unauthorized" }, corsHeaders);
    const userClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json(401, { error: "Unauthorized" }, corsHeaders);
    scopedUserId = user.id;
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data: adminRow } = await admin.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
    mode = adminRow ? "admin" : "user";
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  console.log(`[reprocess][${runId}] mode=${mode} user=${scopedUserId} explicit=${body.invoice_ids?.length ?? 0}`);

  // Selecção de candidatos
  let query = admin.from("invoices")
    .select("id, user_id, tenant_id, created_at, updated_at, supplier_name, montant_ttc, status")
    .is("deleted_at", null)
    .is("drive_file_id", null)
    .not("storage_path", "is", null)
    .in("status", ["inbox", "review", "analyzing"]);

  if (body.invoice_ids && body.invoice_ids.length > 0) {
    query = query.in("id", body.invoice_ids);
  } else {
    // Evita apanhar invoices em processamento activo (< 5 min)
    const cutoff = new Date(Date.now() - STUCK_SINCE_MINUTES * 60 * 1000).toISOString();
    query = query.lt("created_at", cutoff);
  }

  if (mode === "user" && scopedUserId) {
    query = query.eq("user_id", scopedUserId);
  } else if (body.tenant_id && mode === "admin") {
    query = query.eq("tenant_id", body.tenant_id);
  }

  const limit = Math.min(body.limit ?? MAX_PER_RUN, MAX_PER_RUN);
  const { data: candidates, error: qErr } = await query
    .order("created_at", { ascending: true })
    .limit(limit);

  if (qErr) {
    await logEdgeError({
      functionName: "reprocess-pending",
      level: "error",
      message: "Query de candidatos falhou",
      metadata: { run_id: runId, db_error: qErr.message },
    });
    return json(500, { error: qErr.message, run_id: runId }, corsHeaders);
  }

  type Candidate = { id: string; needs_gemini: boolean };
  const rows = (candidates ?? []) as unknown as Array<{ id: string; supplier_name: string | null; montant_ttc: number | null; status: string }>;
  const targets: Candidate[] = rows.map((r) => ({
    id: r.id,
    // Sem Gemini data → precisa re-correr analyze-document primeiro
    needs_gemini: !r.supplier_name && r.montant_ttc === null,
  }));
  console.log(`[reprocess][${runId}] candidates=${targets.length} needs_gemini=${targets.filter((t) => t.needs_gemini).length}`);

  if (targets.length === 0) {
    return json(200, {
      success: true, run_id: runId, total: 0, results: [],
      message: "Sem invoices pendentes",
    }, corsHeaders);
  }

  // Concorrência limitada
  const results: FinalizeResult[] = [];
  let cursor = 0;
  async function worker() {
    while (cursor < targets.length) {
      const idx = cursor++;
      const { id, needs_gemini } = targets[idx];
      try {
        if (needs_gemini) {
          // Chama analyze-document (que agora chama finalizeInvoice internamente)
          // Retry apenas para 5xx (boot cold-start do edge runtime) — 4xx propaga
          let resp: Response | null = null;
          for (let attempt = 0; attempt <= ANALYZE_RETRY_DELAYS_MS.length; attempt++) {
            resp = await fetch(`${supabaseUrl}/functions/v1/analyze-document`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-internal-secret": serviceKey,
              },
              body: JSON.stringify({ invoice_id: id }),
            });
            if (resp.ok || resp.status < 500 || resp.status >= 600) break;
            if (attempt < ANALYZE_RETRY_DELAYS_MS.length) {
              await new Promise((r) => setTimeout(r, ANALYZE_RETRY_DELAYS_MS[attempt]));
            }
          }
          if (!resp || !resp.ok) {
            const txt = resp ? await resp.text() : "";
            const status = resp?.status ?? 0;
            results.push({ ok: false, invoiceId: id, stage: "analyze_document", reason: `${status}: ${txt.slice(0, 120)}` });
            continue;
          }
          const payload = await resp.json();
          const fin: FinalizeResult | undefined = payload?.finalize;
          results.push(fin ?? { ok: true, invoiceId: id, stage: "gemini_done" });
        } else {
          const r = await finalizeInvoice(id, admin, { deleteStorageAfterDrive: true });
          results.push(r);
        }
      } catch (e) {
        console.error(`[reprocess][${runId}] invoice=${id} excepção`, e);
        results.push({ ok: false, invoiceId: id, stage: "exception", reason: e instanceof Error ? e.message : String(e) });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, worker));

  const summary = {
    ok: results.filter((r) => r.ok).length,
    already_done: results.filter((r) => r.already_done).length,
    failed: results.filter((r) => !r.ok).length,
    by_stage: results.reduce<Record<string, number>>((acc, r) => {
      const k = r.ok ? "ok" : `fail:${r.stage}`;
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {}),
  };

  const elapsed = Date.now() - t0;
  console.log(`[reprocess][${runId}] done elapsed=${elapsed}ms ${JSON.stringify(summary)}`);

  // Só grava em error_logs se houver falhas reais. Runs limpos (ok + dedup + already_done)
  // ficam só nos function logs para não poluir /admin/errors com ruído do cron de 15 em 15 min.
  if (summary.failed > 0) {
    await logEdgeError({
      functionName: "reprocess-pending",
      level: "warn",
      message: `Reprocess com falhas: ${summary.failed}/${targets.length}`,
      metadata: { run_id: runId, mode, elapsed_ms: elapsed, summary, total: targets.length },
    });
  }

  return json(200, {
    success: true,
    run_id: runId,
    total: targets.length,
    summary,
    results: results.map((r) => ({
      invoice_id: r.invoiceId,
      ok: r.ok,
      stage: r.stage,
      reason: r.reason,
      drive_file_id: r.drive_file_id,
    })),
  }, corsHeaders);
});

function json(status: number, body: unknown, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
