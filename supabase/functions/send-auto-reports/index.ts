// ============================================
// Edge Function: send-auto-reports
// Cron horário (0 * * * *). Para cada tenant com auto_reports = weekly|monthly,
// verifica se é o momento local (seg 08h para weekly, dia 1 08h para monthly),
// agrega KPIs do período anterior, envia email via Resend e regista em
// report_deliveries. Idempotência via unique (tenant, kind, period_start).
//
// Admin pode forçar preview/teste com Authorization + body.force_tenant_id.
// ============================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders, getFrontendUrl } from "../_shared/cors.ts";
import { logEdgeError } from "../_shared/logError.ts";
import {
  computePreviousWindow,
  computeWindow,
  formatDatePt,
  type PeriodWindow,
} from "../_shared/periodWindow.ts";
import { sendEmail } from "../_shared/resend.ts";
import { renderReportEmail } from "../_shared/reportEmail.ts";
import { fetchPreviousTotalGross, fetchReportData } from "../_shared/reportQueries.ts";

interface TenantRow {
  id: string;
  name: string;
  primary_color: string | null;
  secondary_color: string | null;
  logo_url: string | null;
  timezone: string | null;
  currency: string | null;
  auto_reports: "weekly" | "monthly" | "never";
  report_email: string | null;
}

interface RunResult {
  tenantId: string;
  outcome: "sent" | "skipped_not_due" | "skipped_duplicate" | "skipped_no_recipient" | "failed" | "dry_run";
  reason?: string;
  emailTo?: string;
  periodStart?: string;
  periodEnd?: string;
  subject?: string;
  invoicesCount?: number;
  messageId?: string;
}

function json(status: number, body: unknown, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

async function slackAlert(message: string, tenantId: string): Promise<void> {
  const url = Deno.env.get("SLACK_WEBHOOK_URL");
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `[send-auto-reports] ${message}`,
        blocks: [
          { type: "header", text: { type: "plain_text", text: "Alerta · send-auto-reports" } },
          { type: "section", text: { type: "mrkdwn", text: `*Tenant:* \`${tenantId}\`\n${message}` } },
        ],
      }),
    });
  } catch (e) {
    console.error("[send-auto-reports] slack alert failed", e);
  }
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const runId = crypto.randomUUID();
  const t0 = Date.now();

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const cronSecret = Deno.env.get("CRON_SECRET") || "";
  const fromEmail = Deno.env.get("REPORT_FROM_EMAIL") || "FaturaAI <relatorios@mail.fatura.flowzi.pt>";
  const frontendUrl = getFrontendUrl();

  const cronHeader = req.headers.get("x-cron-secret");
  const isCron = !!cronSecret && cronHeader === cronSecret;

  let body: { force_tenant_id?: string; dry_run?: boolean } = {};
  if (req.method === "POST") {
    try { body = await req.json(); } catch { body = {}; }
  }
  const forceTenantId = typeof body.force_tenant_id === "string" ? body.force_tenant_id : null;
  const dryRun = body.dry_run === true;

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // Permitir: cron OU admin autenticado (para dry_run/force).
  if (!isCron) {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !anonKey) {
      return json(401, { success: false, error: "Unauthorized" }, corsHeaders);
    }
    const userClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json(401, { success: false, error: "Unauthorized" }, corsHeaders);
    const { data: isAdmin, error: isAdminErr } = await supabase.rpc("is_admin_global", { uid: user.id });
    if (isAdminErr || !isAdmin) return json(403, { success: false, error: "Admin required" }, corsHeaders);
    if (!forceTenantId) {
      return json(400, { success: false, error: "force_tenant_id required for admin invocation" }, corsHeaders);
    }
  }

  console.log(`[send-auto-reports][${runId}] start isCron=${isCron} force=${forceTenantId ?? "none"} dry=${dryRun}`);

  let query = supabase
    .from("tenants")
    .select("id, name, primary_color, secondary_color, logo_url, timezone, currency, auto_reports, report_email")
    .in("auto_reports", ["weekly", "monthly"])
    .eq("is_active", true)
    .is("deleted_at", null);
  if (forceTenantId) query = query.eq("id", forceTenantId);

  const { data: tenants, error: tenantsErr } = await query;
  if (tenantsErr) {
    await logEdgeError({
      functionName: "send-auto-reports", level: "error",
      message: "falha a listar tenants", requestId: runId, metadata: { db_error: tenantsErr.message },
    });
    return json(500, { success: false, error: tenantsErr.message }, corsHeaders);
  }

  const results: RunResult[] = [];
  const nowUtc = new Date();

  for (const tenant of (tenants ?? []) as TenantRow[]) {
    try {
      const result = await processTenant({
        tenant, nowUtc, forceTenantId, dryRun, supabase, fromEmail, frontendUrl, runId,
      });
      results.push(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await logEdgeError({
        functionName: "send-auto-reports", level: "error",
        message: `tenant processing failed: ${msg}`,
        tenantId: tenant.id, requestId: runId,
      });
      await slackAlert(`Falha a processar tenant ${tenant.name}: ${msg}`, tenant.id);
      results.push({ tenantId: tenant.id, outcome: "failed", reason: msg });
    }
  }

  const summary = {
    sent: results.filter((r) => r.outcome === "sent").length,
    skipped: results.filter((r) => r.outcome.startsWith("skipped")).length,
    failed: results.filter((r) => r.outcome === "failed").length,
    dry_run: results.filter((r) => r.outcome === "dry_run").length,
  };

  console.log(`[send-auto-reports][${runId}] done in ${Date.now() - t0}ms`, summary);

  return json(200, { success: true, run_id: runId, ...summary, results }, corsHeaders);
});

interface ProcessArgs {
  tenant: TenantRow;
  nowUtc: Date;
  forceTenantId: string | null;
  dryRun: boolean;
  supabase: SupabaseClient;
  fromEmail: string;
  frontendUrl: string;
  runId: string;
}

async function processTenant(a: ProcessArgs): Promise<RunResult> {
  const { tenant, nowUtc, forceTenantId, dryRun, supabase, fromEmail, frontendUrl, runId } = a;
  const kind = tenant.auto_reports as "weekly" | "monthly";
  const timezone = tenant.timezone || "Europe/Lisbon";
  const win: PeriodWindow = computeWindow(kind, nowUtc, timezone);

  if (!forceTenantId && !win.shouldSendNow) {
    return { tenantId: tenant.id, outcome: "skipped_not_due" };
  }

  const { data: existing } = await supabase
    .from("report_deliveries")
    .select("id, status")
    .eq("tenant_id", tenant.id)
    .eq("period_kind", kind)
    .eq("period_start", win.periodStart)
    .maybeSingle();
  if (existing && !forceTenantId) {
    return { tenantId: tenant.id, outcome: "skipped_duplicate" };
  }

  let emailTo = tenant.report_email;
  if (!emailTo) {
    const { data: owner } = await supabase.rpc("get_tenant_owner_email", { target_tenant: tenant.id });
    if (typeof owner === "string" && owner) emailTo = owner;
  }
  if (!emailTo) {
    await logEdgeError({
      functionName: "send-auto-reports", level: "warn",
      message: "sem destinatário para relatório",
      tenantId: tenant.id, requestId: runId,
      metadata: { period_start: win.periodStart, kind },
    });
    return { tenantId: tenant.id, outcome: "skipped_no_recipient", periodStart: win.periodStart, periodEnd: win.periodEnd };
  }

  const data = await fetchReportData(supabase, tenant.id, win.periodStart, win.periodEnd);
  const prev = computePreviousWindow(kind, win.periodStart);
  const prevTotal = await fetchPreviousTotalGross(supabase, tenant.id, prev.start, prev.end);

  const email = renderReportEmail({
    tenantName: tenant.name,
    primaryColor: tenant.primary_color ?? "#0E2435",
    secondaryColor: tenant.secondary_color ?? "#BBB388",
    logoUrl: tenant.logo_url,
    periodKind: kind,
    periodStartLabel: formatDatePt(win.periodStart),
    periodEndLabel: formatDatePt(win.periodEnd),
    currency: tenant.currency ?? "EUR",
    kpis: data.kpis,
    topSuppliers: data.topSuppliers,
    categoryBreakdown: data.categoryBreakdown,
    previousPeriodTotalGross: prevTotal,
    dashboardUrl: frontendUrl,
    settingsUrl: `${frontendUrl}/settings`,
  });

  if (dryRun) {
    return {
      tenantId: tenant.id, outcome: "dry_run",
      emailTo, periodStart: win.periodStart, periodEnd: win.periodEnd,
      subject: email.subject, invoicesCount: data.kpis.invoicesCount,
    };
  }

  const send = await sendEmail({
    from: fromEmail, to: emailTo,
    subject: email.subject, html: email.html, text: email.text,
    replyTo: "suporte@fatura.flowzi.pt",
    tags: [{ name: "kind", value: kind }, { name: "tenant_id", value: tenant.id }],
  });

  await supabase.from("report_deliveries").insert({
    tenant_id: tenant.id,
    period_kind: kind,
    period_start: win.periodStart,
    period_end: win.periodEnd,
    email_to: emailTo,
    status: send.ok ? "sent" : "failed",
    error: send.ok ? null : (send.error ?? "unknown").slice(0, 500),
    message_id: send.messageId ?? null,
    invoices_count: data.kpis.invoicesCount,
    total_ttc: data.kpis.totalGross,
  });

  if (!send.ok) {
    await logEdgeError({
      functionName: "send-auto-reports", level: "error",
      message: `resend failed: ${send.error}`,
      tenantId: tenant.id, requestId: runId,
      metadata: { period_start: win.periodStart, kind, email_to: emailTo, status: send.status },
    });
    await slackAlert(`Resend falhou para ${tenant.name} (${emailTo}): ${send.error}`, tenant.id);
    return {
      tenantId: tenant.id, outcome: "failed",
      reason: send.error, emailTo, periodStart: win.periodStart, periodEnd: win.periodEnd,
    };
  }

  return {
    tenantId: tenant.id, outcome: "sent",
    emailTo, periodStart: win.periodStart, periodEnd: win.periodEnd,
    subject: email.subject, invoicesCount: data.kpis.invoicesCount, messageId: send.messageId,
  };
}
