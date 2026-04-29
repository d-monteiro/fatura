// ============================================
// Edge Function: send-auto-reports
// Cron horário (0 * * * *). Itera report_configs WHERE active=true; para cada
// config calcula a janela com (frequency, send_day, send_hour) e envia se for
// o momento. Idempotência via unique (config_id, period_start).
//
// Detecta 3 falhas consecutivas por config_id e dispara slack alert uma vez.
//
// Admin pode forçar com Authorization + body.force_config_id (ou
// force_tenant_id para todos os configs activos do tenant).
// ============================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders, getFrontendUrl } from "../_shared/cors.ts";
import { logEdgeError } from "../_shared/logError.ts";
import {
  computePreviousWindow,
  computeWindowFor,
  formatDatePt,
  type PeriodKind,
  type PeriodWindow,
} from "../_shared/periodWindow.ts";
import { sendEmail } from "../_shared/resend.ts";
import { renderReportEmail, type ReportContentOptions } from "../_shared/reportEmail.ts";
import { fetchPreviousTotalGross, fetchReportData, type ReportFilters } from "../_shared/reportQueries.ts";

interface TenantBranding {
  id: string;
  name: string;
  primary_color: string | null;
  secondary_color: string | null;
  logo_url: string | null;
  timezone: string | null;
  currency: string | null;
}

interface ReportConfigRow {
  id: string;
  tenant_id: string;
  name: string;
  frequency: PeriodKind;
  send_day: number;
  send_hour: number;
  recipients: string[];
  content_options: ReportContentOptions;
  filters: { companyIds?: string[] | null; categories?: string[] | null } | null;
  active: boolean;
  tenants: TenantBranding;
}

interface RunResult {
  configId: string;
  tenantId: string;
  outcome: "sent" | "skipped_not_due" | "skipped_duplicate" | "skipped_no_recipient" | "failed" | "dry_run";
  reason?: string;
  emailTo?: string;
  periodStart?: string;
  periodEnd?: string;
  subject?: string;
  invoicesCount?: number;
}

function json(status: number, body: unknown, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

async function slackAlert(message: string, tenantId: string, configId: string): Promise<void> {
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
          { type: "section", text: { type: "mrkdwn", text: `*Tenant:* \`${tenantId}\`\n*Config:* \`${configId}\`\n${message}` } },
        ],
      }),
    });
  } catch (e) {
    console.error("[send-auto-reports] slack alert failed", e);
  }
}

// 3 falhas consecutivas (last 3 deliveries do config = failed) dispara alerta.
async function maybeAlertConsecutiveFailures(
  supabase: SupabaseClient, configId: string, tenantId: string, configName: string,
): Promise<void> {
  const { data } = await supabase
    .from("report_deliveries")
    .select("status")
    .eq("config_id", configId)
    .order("sent_at", { ascending: false })
    .limit(3);
  const rows = (data ?? []) as { status: string }[];
  if (rows.length < 3) return;
  if (rows.every((r) => r.status === "failed")) {
    await slackAlert(`Config "${configName}" falhou 3 vezes seguidas — investigar.`, tenantId, configId);
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

  let body: { force_tenant_id?: string; force_config_id?: string; dry_run?: boolean } = {};
  if (req.method === "POST") {
    try { body = await req.json(); } catch { body = {}; }
  }
  const forceTenantId = typeof body.force_tenant_id === "string" ? body.force_tenant_id : null;
  const forceConfigId = typeof body.force_config_id === "string" ? body.force_config_id : null;
  const dryRun = body.dry_run === true;

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

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
    if (!forceTenantId && !forceConfigId) {
      return json(400, { success: false, error: "force_tenant_id ou force_config_id obrigatório" }, corsHeaders);
    }
  }

  console.log(`[send-auto-reports][${runId}] start isCron=${isCron} dry=${dryRun} ftid=${forceTenantId ?? "-"} fcid=${forceConfigId ?? "-"}`);

  let query = supabase
    .from("report_configs")
    .select(`
      id, tenant_id, name, frequency, send_day, send_hour, recipients, content_options, filters, active,
      tenants:tenant_id ( id, name, primary_color, secondary_color, logo_url, timezone, currency, is_active, deleted_at )
    `)
    .eq("active", true);
  if (forceConfigId) query = query.eq("id", forceConfigId);
  if (forceTenantId) query = query.eq("tenant_id", forceTenantId);

  const { data: configs, error: configsErr } = await query;
  if (configsErr) {
    await logEdgeError({
      functionName: "send-auto-reports", level: "error",
      message: "falha a listar report_configs", requestId: runId, metadata: { db_error: configsErr.message },
    });
    return json(500, { success: false, error: configsErr.message }, corsHeaders);
  }

  const results: RunResult[] = [];
  const nowUtc = new Date();

  for (const raw of (configs ?? []) as unknown as ReportConfigRow[]) {
    const tenant = raw.tenants;
    if (!tenant || !(tenant as unknown as { is_active?: boolean }).is_active) continue;
    if ((tenant as unknown as { deleted_at?: string | null }).deleted_at) continue;
    try {
      const result = await processConfig({
        config: raw, nowUtc,
        force: !!forceConfigId || !!forceTenantId,
        dryRun, supabase, fromEmail, frontendUrl, runId,
      });
      results.push(result);
      if (result.outcome === "failed") {
        await maybeAlertConsecutiveFailures(supabase, raw.id, raw.tenant_id, raw.name);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await logEdgeError({
        functionName: "send-auto-reports", level: "error",
        message: `config processing failed: ${msg}`,
        tenantId: raw.tenant_id, requestId: runId,
        metadata: { config_id: raw.id, config_name: raw.name },
      });
      results.push({ configId: raw.id, tenantId: raw.tenant_id, outcome: "failed", reason: msg });
      await maybeAlertConsecutiveFailures(supabase, raw.id, raw.tenant_id, raw.name);
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
  config: ReportConfigRow;
  nowUtc: Date;
  force: boolean;
  dryRun: boolean;
  supabase: SupabaseClient;
  fromEmail: string;
  frontendUrl: string;
  runId: string;
}

async function processConfig(a: ProcessArgs): Promise<RunResult> {
  const { config, nowUtc, force, dryRun, supabase, fromEmail, frontendUrl, runId } = a;
  const tenant = config.tenants;
  const timezone = tenant.timezone || "Europe/Lisbon";
  const win: PeriodWindow = computeWindowFor(config.frequency, config.send_day, config.send_hour, nowUtc, timezone);

  if (!force && !win.shouldSendNow) {
    return { configId: config.id, tenantId: config.tenant_id, outcome: "skipped_not_due" };
  }

  const { data: existing } = await supabase
    .from("report_deliveries")
    .select("id, status")
    .eq("config_id", config.id)
    .eq("period_start", win.periodStart)
    .maybeSingle();
  if (existing && !force) {
    return { configId: config.id, tenantId: config.tenant_id, outcome: "skipped_duplicate" };
  }

  const recipients = (config.recipients ?? []).filter((r) => typeof r === "string" && r.includes("@"));
  if (recipients.length === 0) {
    await logEdgeError({
      functionName: "send-auto-reports", level: "warn",
      message: "config sem destinatários",
      tenantId: config.tenant_id, requestId: runId,
      metadata: { config_id: config.id, config_name: config.name, period_start: win.periodStart },
    });
    return {
      configId: config.id, tenantId: config.tenant_id, outcome: "skipped_no_recipient",
      periodStart: win.periodStart, periodEnd: win.periodEnd,
    };
  }

  const filters: ReportFilters = {
    companyIds: config.filters?.companyIds ?? null,
    categories: config.filters?.categories ?? null,
  };

  const data = await fetchReportData(supabase, config.tenant_id, win.periodStart, win.periodEnd, filters);
  const prev = computePreviousWindow(config.frequency, win.periodStart);
  const prevTotal = await fetchPreviousTotalGross(supabase, config.tenant_id, prev.start, prev.end, filters);

  const email = renderReportEmail({
    tenantName: tenant.name,
    configName: config.name,
    primaryColor: tenant.primary_color ?? "#0E2435",
    secondaryColor: tenant.secondary_color ?? "#BBB388",
    logoUrl: tenant.logo_url,
    periodKind: config.frequency,
    periodStartLabel: formatDatePt(win.periodStart),
    periodEndLabel: formatDatePt(win.periodEnd),
    currency: tenant.currency ?? "EUR",
    kpis: data.kpis,
    topSuppliers: data.topSuppliers,
    categoryBreakdown: data.categoryBreakdown,
    topExpenses: data.topExpenses,
    previousPeriodTotalGross: prevTotal,
    dashboardUrl: frontendUrl,
    settingsUrl: `${frontendUrl}/settings`,
    contentOptions: config.content_options,
  });

  const emailTo = recipients.join(", ");

  if (dryRun) {
    return {
      configId: config.id, tenantId: config.tenant_id, outcome: "dry_run",
      emailTo, periodStart: win.periodStart, periodEnd: win.periodEnd,
      subject: email.subject, invoicesCount: data.kpis.invoicesCount,
    };
  }

  const send = await sendEmail({
    from: fromEmail, to: recipients,
    subject: email.subject, html: email.html, text: email.text,
    replyTo: "suporte@fatura.flowzi.pt",
    tags: [
      { name: "kind", value: config.frequency },
      { name: "tenant_id", value: config.tenant_id },
      { name: "config_id", value: config.id },
    ],
  });

  await supabase.from("report_deliveries").insert({
    tenant_id: config.tenant_id,
    config_id: config.id,
    period_kind: config.frequency,
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
      tenantId: config.tenant_id, requestId: runId,
      metadata: { config_id: config.id, period_start: win.periodStart, kind: config.frequency, email_to: emailTo, status: send.status },
    });
    return {
      configId: config.id, tenantId: config.tenant_id, outcome: "failed",
      reason: send.error, emailTo, periodStart: win.periodStart, periodEnd: win.periodEnd,
    };
  }

  return {
    configId: config.id, tenantId: config.tenant_id, outcome: "sent",
    emailTo, periodStart: win.periodStart, periodEnd: win.periodEnd,
    subject: email.subject, invoicesCount: data.kpis.invoicesCount,
  };
}
