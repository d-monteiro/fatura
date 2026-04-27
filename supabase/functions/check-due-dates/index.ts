// ============================================
// Edge Function: check-due-dates
// Cron diário (08:00 UTC). Para cada tenant com faturas por pagar a vencer
// em <=3 dias (ou já vencidas) e sem notificação prévia, envia 1 email
// consolidado via Resend. Idempotência: payment_notified_at.
//
// Re-notifica automaticamente quando o user edita data_vencimento (trigger
// trg_reset_payment_notified no SQL repõe payment_notified_at=NULL).
//
// Admin pode forçar com Authorization + body.force_tenant_id / dry_run.
// ============================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders, getFrontendUrl } from "../_shared/cors.ts";
import { logEdgeError } from "../_shared/logError.ts";
import { formatDatePt } from "../_shared/periodWindow.ts";
import { sendEmail } from "../_shared/resend.ts";
import { renderDueDateEmail, type DueDateRow } from "../_shared/dueDateEmail.ts";

const WINDOW_DAYS = 3;

interface TenantRow {
  id: string;
  name: string;
  primary_color: string | null;
  secondary_color: string | null;
  logo_url: string | null;
  currency: string | null;
  report_email: string | null;
}

interface InvoiceRow {
  id: string;
  supplier_name: string | null;
  doc_number: string | null;
  data_vencimento: string;
  valor_total: number | null;
}

interface RunResult {
  tenantId: string;
  outcome: "sent" | "skipped_no_rows" | "skipped_no_recipient" | "failed" | "dry_run";
  reason?: string;
  emailTo?: string;
  invoicesCount?: number;
  messageId?: string;
}

function json(status: number, body: unknown, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d) + days * 86_400_000);
  return next.toISOString().slice(0, 10);
}

function diffDays(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split("-").map(Number);
  const [ty, tm, td] = toIso.split("-").map(Number);
  const a = Date.UTC(fy, fm - 1, fd);
  const b = Date.UTC(ty, tm - 1, td);
  return Math.round((b - a) / 86_400_000);
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
  const fromEmail = Deno.env.get("REPORT_FROM_EMAIL") || "FaturaAI <alertas@mail.fatura.flowzi.pt>";
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

  const today = todayIso();
  const horizon = addDaysIso(today, WINDOW_DAYS);

  console.log(`[check-due-dates][${runId}] start today=${today} horizon=${horizon} force=${forceTenantId ?? "none"} dry=${dryRun}`);

  // 1) Buscar faturas elegíveis (já vencidas ou a vencer <=3d) sem notificação.
  let invoicesQuery = supabase
    .from("invoices")
    .select("id, tenant_id, supplier_name, doc_number, data_vencimento, valor_total")
    .is("deleted_at", null)
    .is("paid_at", null)
    .is("payment_notified_at", null)
    .not("data_vencimento", "is", null)
    .lte("data_vencimento", horizon)
    .order("data_vencimento", { ascending: true });

  if (forceTenantId) invoicesQuery = invoicesQuery.eq("tenant_id", forceTenantId);

  const { data: invoices, error: invErr } = await invoicesQuery;
  if (invErr) {
    await logEdgeError({
      functionName: "check-due-dates", level: "error",
      message: "falha a listar faturas", requestId: runId, metadata: { db_error: invErr.message },
    });
    return json(500, { success: false, error: invErr.message }, corsHeaders);
  }

  // 2) Agrupar por tenant.
  const byTenant = new Map<string, InvoiceRow[]>();
  for (const inv of (invoices ?? []) as (InvoiceRow & { tenant_id: string })[]) {
    const list = byTenant.get(inv.tenant_id) ?? [];
    list.push({
      id: inv.id,
      supplier_name: inv.supplier_name,
      doc_number: inv.doc_number,
      data_vencimento: inv.data_vencimento,
      valor_total: inv.valor_total,
    });
    byTenant.set(inv.tenant_id, list);
  }

  if (byTenant.size === 0) {
    console.log(`[check-due-dates][${runId}] no eligible invoices`);
    return json(200, { success: true, run_id: runId, sent: 0, skipped: 0, failed: 0, results: [] }, corsHeaders);
  }

  // 3) Carregar tenants correspondentes.
  const tenantIds = [...byTenant.keys()];
  const { data: tenants, error: tenantsErr } = await supabase
    .from("tenants")
    .select("id, name, primary_color, secondary_color, logo_url, currency, report_email")
    .in("id", tenantIds)
    .eq("is_active", true)
    .is("deleted_at", null);

  if (tenantsErr) {
    await logEdgeError({
      functionName: "check-due-dates", level: "error",
      message: "falha a listar tenants", requestId: runId, metadata: { db_error: tenantsErr.message },
    });
    return json(500, { success: false, error: tenantsErr.message }, corsHeaders);
  }

  const results: RunResult[] = [];
  for (const tenant of (tenants ?? []) as TenantRow[]) {
    const tenantInvoices = byTenant.get(tenant.id) ?? [];
    if (tenantInvoices.length === 0) continue;
    try {
      const result = await processTenant({
        tenant, invoices: tenantInvoices, today,
        supabase, fromEmail, frontendUrl, runId, dryRun,
      });
      results.push(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await logEdgeError({
        functionName: "check-due-dates", level: "error",
        message: `tenant processing failed: ${msg}`,
        tenantId: tenant.id, requestId: runId,
      });
      results.push({ tenantId: tenant.id, outcome: "failed", reason: msg });
    }
  }

  const summary = {
    sent: results.filter((r) => r.outcome === "sent").length,
    skipped: results.filter((r) => r.outcome.startsWith("skipped")).length,
    failed: results.filter((r) => r.outcome === "failed").length,
    dry_run: results.filter((r) => r.outcome === "dry_run").length,
  };

  console.log(`[check-due-dates][${runId}] done in ${Date.now() - t0}ms`, summary);
  return json(200, { success: true, run_id: runId, ...summary, results }, corsHeaders);
});

interface ProcessArgs {
  tenant: TenantRow;
  invoices: InvoiceRow[];
  today: string;
  supabase: SupabaseClient;
  fromEmail: string;
  frontendUrl: string;
  runId: string;
  dryRun: boolean;
}

async function processTenant(a: ProcessArgs): Promise<RunResult> {
  const { tenant, invoices, today, supabase, fromEmail, frontendUrl, runId, dryRun } = a;

  let emailTo = tenant.report_email;
  if (!emailTo) {
    const { data: owner } = await supabase.rpc("get_tenant_owner_email", { target_tenant: tenant.id });
    if (typeof owner === "string" && owner) emailTo = owner;
  }
  if (!emailTo) {
    await logEdgeError({
      functionName: "check-due-dates", level: "warn",
      message: "sem destinatário para alerta de prazos",
      tenantId: tenant.id, requestId: runId,
      metadata: { invoices_count: invoices.length },
    });
    return { tenantId: tenant.id, outcome: "skipped_no_recipient", invoicesCount: invoices.length };
  }

  const currency = tenant.currency ?? "EUR";
  const rows: DueDateRow[] = invoices.map((inv) => ({
    supplierName: inv.supplier_name ?? "Fornecedor desconhecido",
    docNumber: inv.doc_number,
    dueDateLabel: formatDatePt(inv.data_vencimento),
    daysLeft: diffDays(today, inv.data_vencimento),
    amountTotal: inv.valor_total ?? 0,
    url: `${frontendUrl}/invoices?highlight=${inv.id}`,
  }));
  const totalTtc = rows.reduce((s, r) => s + r.amountTotal, 0);

  const email = renderDueDateEmail({
    tenantName: tenant.name,
    primaryColor: tenant.primary_color ?? "#0E2435",
    secondaryColor: tenant.secondary_color ?? "#BBB388",
    logoUrl: tenant.logo_url,
    currency,
    rows,
    totalTtc,
    dashboardUrl: frontendUrl,
    settingsUrl: `${frontendUrl}/settings`,
  });

  if (dryRun) {
    return {
      tenantId: tenant.id, outcome: "dry_run", emailTo,
      invoicesCount: invoices.length,
    };
  }

  const send = await sendEmail({
    from: fromEmail, to: emailTo,
    subject: email.subject, html: email.html, text: email.text,
    replyTo: "suporte@fatura.flowzi.pt",
    tags: [{ name: "kind", value: "due_dates" }, { name: "tenant_id", value: tenant.id }],
  });

  if (!send.ok) {
    await logEdgeError({
      functionName: "check-due-dates", level: "error",
      message: `resend failed: ${send.error}`,
      tenantId: tenant.id, requestId: runId,
      metadata: { email_to: emailTo, status: send.status, invoices_count: invoices.length },
    });
    return { tenantId: tenant.id, outcome: "failed", reason: send.error, emailTo, invoicesCount: invoices.length };
  }

  // 4) Marcar como notificadas (idempotência para próximos crons).
  const ids = invoices.map((i) => i.id);
  const { error: updErr } = await supabase
    .from("invoices")
    .update({ payment_notified_at: new Date().toISOString() })
    .in("id", ids);
  if (updErr) {
    await logEdgeError({
      functionName: "check-due-dates", level: "warn",
      message: `email enviado mas falhou a marcar payment_notified_at: ${updErr.message}`,
      tenantId: tenant.id, requestId: runId,
      metadata: { invoice_ids: ids },
    });
  }

  return {
    tenantId: tenant.id, outcome: "sent", emailTo,
    invoicesCount: invoices.length, messageId: send.messageId,
  };
}
