// ============================================
// Edge Function: send-report-now
// Envia um relatório imediato (teste ou re-envio) sem esperar pelo cron.
//
// Modos:
//  - body.config_id + body.period_start? + body.test_recipient?
//      Envia config para o período pedido (default = janela actual computada).
//      Se test_recipient: envia para esse email apenas (não regista delivery).
//  - body.delivery_id
//      Re-envia uma delivery anterior (mesmo período + recipients) e regista
//      uma nova linha em report_deliveries.
//
// Permissões: utilizador precisa ser membro do tenant do config (RLS) ou admin.
// ============================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders, getFrontendUrl } from "../_shared/cors.ts";
import { logEdgeError } from "../_shared/logError.ts";
import {
  addDaysIso,
  computePreviousWindow,
  computeWindowFor,
  formatDatePt,
  periodKindLengthDays,
  type PeriodKind,
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
}

function json(status: number, body: unknown, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

async function loadTenant(sb: SupabaseClient, tenantId: string): Promise<TenantBranding | null> {
  const { data, error } = await sb
    .from("tenants")
    .select("id, name, primary_color, secondary_color, logo_url, timezone, currency")
    .eq("id", tenantId)
    .maybeSingle();
  if (error || !data) return null;
  return data as TenantBranding;
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { success: false, error: "Method not allowed" }, corsHeaders);

  const runId = crypto.randomUUID();
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const fromEmail = Deno.env.get("REPORT_FROM_EMAIL") || "FaturaAI <relatorios@mail.fatura.flowzi.pt>";
  const frontendUrl = getFrontendUrl();

  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !anonKey) return json(401, { success: false, error: "Unauthorized" }, corsHeaders);

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json(401, { success: false, error: "Unauthorized" }, corsHeaders);

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  let body: { config_id?: string; period_start?: string; test_recipient?: string; delivery_id?: string } = {};
  try { body = await req.json(); } catch { /* ignore */ }

  const configId = typeof body.config_id === "string" ? body.config_id : null;
  const deliveryId = typeof body.delivery_id === "string" ? body.delivery_id : null;
  const testRecipient = typeof body.test_recipient === "string" && body.test_recipient.includes("@")
    ? body.test_recipient.trim()
    : null;
  const explicitPeriodStart = typeof body.period_start === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.period_start)
    ? body.period_start
    : null;

  if (!configId && !deliveryId) {
    return json(400, { success: false, error: "config_id ou delivery_id obrigatório" }, corsHeaders);
  }

  let resolvedConfigId = configId;
  let resolvedPeriodStart = explicitPeriodStart;
  let resolvedRecipients: string[] | null = null;

  if (deliveryId) {
    const { data: del, error: delErr } = await supabase
      .from("report_deliveries")
      .select("config_id, tenant_id, period_start, email_to")
      .eq("id", deliveryId)
      .maybeSingle();
    if (delErr || !del) return json(404, { success: false, error: "Delivery não encontrada" }, corsHeaders);
    if (!del.config_id) return json(400, { success: false, error: "Delivery legacy sem config — re-envio não suportado" }, corsHeaders);
    resolvedConfigId = del.config_id as string;
    resolvedPeriodStart = del.period_start as string;
    resolvedRecipients = String(del.email_to ?? "").split(",").map((s) => s.trim()).filter((s) => s.includes("@"));
  }

  if (!resolvedConfigId) return json(400, { success: false, error: "config_id resolvido vazio" }, corsHeaders);

  const { data: cfg, error: cfgErr } = await supabase
    .from("report_configs")
    .select("id, tenant_id, name, frequency, send_day, send_hour, recipients, content_options, filters, active")
    .eq("id", resolvedConfigId)
    .maybeSingle();
  if (cfgErr || !cfg) return json(404, { success: false, error: "Config não encontrada" }, corsHeaders);
  const config = cfg as ReportConfigRow;

  // Permissão: writer do tenant (owner/member) ou admin global. Readonly não envia.
  const { data: canWrite } = await supabase.rpc("can_write_tenant", { uid: user.id, target_tenant: config.tenant_id });
  if (!canWrite) {
    const { data: isAdmin } = await supabase.rpc("is_admin_global", { uid: user.id });
    if (!isAdmin) return json(403, { success: false, error: "Sem permissão para enviar relatórios" }, corsHeaders);
  }

  const tenant = await loadTenant(supabase, config.tenant_id);
  if (!tenant) return json(404, { success: false, error: "Tenant não encontrado" }, corsHeaders);
  const timezone = tenant.timezone || "Europe/Lisbon";

  // Janela: explícita ou computada agora (período "actual" para teste).
  let periodStart: string;
  let periodEnd: string;
  if (resolvedPeriodStart) {
    periodStart = resolvedPeriodStart;
    const win = computeWindowFor(config.frequency, config.send_day, config.send_hour, new Date(), timezone);
    // Se period_start coincide com a janela actual, usa o periodEnd computado.
    // Senão, derivar end por frequência (caso re-envio antigo).
    if (win.periodStart === periodStart) {
      periodEnd = win.periodEnd;
    } else {
      const prev = computePreviousWindow(
        config.frequency,
        addDaysIso(periodStart, periodKindLengthDays(config.frequency)),
      );
      periodEnd = prev.end;
    }
  } else {
    const win = computeWindowFor(config.frequency, config.send_day, config.send_hour, new Date(), timezone);
    periodStart = win.periodStart;
    periodEnd = win.periodEnd;
  }

  const filters: ReportFilters = {
    companyIds: config.filters?.companyIds ?? null,
    categories: config.filters?.categories ?? null,
  };

  const data = await fetchReportData(supabase, config.tenant_id, periodStart, periodEnd, filters);
  const prev = computePreviousWindow(config.frequency, periodStart);
  const prevTotal = await fetchPreviousTotalGross(supabase, config.tenant_id, prev.start, prev.end, filters);

  const email = renderReportEmail({
    tenantName: tenant.name,
    configName: config.name,
    primaryColor: tenant.primary_color ?? "#0E2435",
    secondaryColor: tenant.secondary_color ?? "#BBB388",
    logoUrl: tenant.logo_url,
    periodKind: config.frequency,
    periodStartLabel: formatDatePt(periodStart),
    periodEndLabel: formatDatePt(periodEnd),
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

  // Recipients: testRecipient > resolvedRecipients (re-envio) > config.recipients
  const recipients = testRecipient
    ? [testRecipient]
    : (resolvedRecipients && resolvedRecipients.length > 0
        ? resolvedRecipients
        : (config.recipients ?? []).filter((r) => typeof r === "string" && r.includes("@")));
  if (recipients.length === 0) {
    return json(400, { success: false, error: "Sem destinatários" }, corsHeaders);
  }

  const send = await sendEmail({
    from: fromEmail, to: recipients,
    subject: testRecipient ? `[TESTE] ${email.subject}` : email.subject,
    html: email.html, text: email.text,
    replyTo: "suporte@fatura.flowzi.pt",
    tags: [
      { name: "kind", value: config.frequency },
      { name: "tenant_id", value: config.tenant_id },
      { name: "config_id", value: config.id },
      { name: "mode", value: testRecipient ? "test" : (deliveryId ? "resend" : "manual") },
    ],
  });

  if (!send.ok) {
    if (!send.skipped) {
      await logEdgeError({
        functionName: "send-report-now", level: "error",
        message: `resend failed: ${send.error}`,
        tenantId: config.tenant_id, requestId: runId,
        metadata: { config_id: config.id, period_start: periodStart, status: send.status },
      });
    }
    return json(502, { success: false, error: send.error ?? "send_failed" }, corsHeaders);
  }

  // Só regista delivery em re-envio ou envio manual real (não em teste).
  if (!testRecipient) {
    await supabase.from("report_deliveries").insert({
      tenant_id: config.tenant_id,
      config_id: config.id,
      period_kind: config.frequency,
      period_start: periodStart,
      period_end: periodEnd,
      email_to: recipients.join(", "),
      status: "sent",
      message_id: send.messageId ?? null,
      invoices_count: data.kpis.invoicesCount,
      total_ttc: data.kpis.totalGross,
    });
  }

  return json(200, {
    success: true,
    sent_to: recipients,
    period_start: periodStart,
    period_end: periodEnd,
    invoices_count: data.kpis.invoicesCount,
    subject: email.subject,
    test: !!testRecipient,
    resend: !!deliveryId,
  }, corsHeaders);
});

