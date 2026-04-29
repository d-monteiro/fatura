// Template HTML dos relatórios automáticos. Inline CSS (Gmail strip <style>).
// Tabelas em vez de flex/grid para compatibilidade com Outlook/Apple Mail.

import type { BreakdownRow, PeriodKpis, SupplierRow, TopExpenseRow } from "./reportQueries.ts";

export type EmailPeriodKind = "daily" | "weekly" | "monthly" | "quarterly";

export interface ReportContentOptions {
  totals?: boolean;
  top_suppliers?: boolean;
  categories?: boolean;
  alerts?: boolean;
  top_expenses?: boolean;
}

export interface ReportEmailInput {
  tenantName: string;
  configName?: string | null;
  primaryColor: string;
  secondaryColor: string;
  logoUrl: string | null;
  periodKind: EmailPeriodKind;
  periodStartLabel: string;
  periodEndLabel: string;
  currency: string;
  kpis: PeriodKpis;
  topSuppliers: SupplierRow[];
  categoryBreakdown: BreakdownRow[];
  topExpenses: TopExpenseRow[];
  previousPeriodTotalGross: number;
  dashboardUrl: string;
  settingsUrl: string;
  contentOptions?: ReportContentOptions;
}

export interface ReportEmailOutput {
  subject: string;
  html: string;
  text: string;
}

const HEX6 = /^#[0-9A-Fa-f]{6}$/;

function safeColor(v: string | null | undefined, fallback: string): string {
  return v && HEX6.test(v) ? v : fallback;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmtMoney(value: number, currency: string): string {
  const num = new Intl.NumberFormat("pt-PT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
  return `${num} ${currency}`;
}

interface Delta {
  color: string;
  label: string;
  hasPrevious: boolean;
}

function computeDelta(current: number, previous: number): Delta {
  if (previous === 0) {
    return { color: "#71717a", label: "—", hasPrevious: false };
  }
  const rounded = Math.round(((current - previous) / previous) * 100);
  const sign = rounded > 0 ? "+" : "";
  const color = rounded > 0 ? "#dc2626" : rounded < 0 ? "#16a34a" : "#71717a";
  return { color, label: `${sign}${rounded}%`, hasPrevious: true };
}

function renderKpiCard(label: string, value: string, valueColor?: string): string {
  const color = valueColor ? ` color:${valueColor};` : "";
  return `<div style="border:1px solid #e5e7eb;border-radius:8px;padding:14px;">
    <div style="font-size:11px;color:#71717a;text-transform:uppercase;letter-spacing:.04em;">${esc(label)}</div>
    <div style="font-size:20px;font-weight:700;margin-top:4px;${color}">${esc(value)}</div>
  </div>`;
}

function renderSuppliersTable(rows: SupplierRow[], currency: string): string {
  if (rows.length === 0) return "";
  const head = `<tr style="background:#f4f4f5;color:#71717a;font-size:11px;text-transform:uppercase;letter-spacing:.04em;">
    <td style="padding:8px 10px;text-align:left;">Fornecedor</td>
    <td style="padding:8px 10px;text-align:right;">Faturas</td>
    <td style="padding:8px 10px;text-align:right;">Total</td>
  </tr>`;
  const body = rows.map((s) => `<tr style="border-top:1px solid #e5e7eb;">
    <td style="padding:8px 10px;">${esc(s.name)}</td>
    <td style="padding:8px 10px;text-align:right;">${s.invoicesCount}</td>
    <td style="padding:8px 10px;text-align:right;font-variant-numeric:tabular-nums;">${esc(fmtMoney(s.totalGross, currency))}</td>
  </tr>`).join("");
  return `<h2 style="margin:0 0 10px;font-size:14px;font-weight:600;">Principais fornecedores</h2>
  <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">${head}${body}</table>`;
}

function renderBreakdown(title: string, rows: BreakdownRow[], currency: string, accent: string): string {
  if (rows.length === 0) return "";
  const total = rows.reduce((a, b) => a + b.totalGross, 0);
  const items = rows.slice(0, 6).map((r) => {
    const pct = total > 0 ? Math.round((r.totalGross / total) * 100) : 0;
    return `<tr>
      <td style="padding:6px 0;font-size:13px;width:40%;">${esc(r.label)}</td>
      <td style="padding:6px 8px;width:40%;">
        <div style="background:#f4f4f5;border-radius:4px;overflow:hidden;height:8px;">
          <div style="background:${accent};width:${pct}%;height:8px;"></div>
        </div>
      </td>
      <td style="padding:6px 0;font-size:13px;text-align:right;font-variant-numeric:tabular-nums;">${esc(fmtMoney(r.totalGross, currency))}</td>
    </tr>`;
  }).join("");
  return `<h2 style="margin:0 0 10px;font-size:14px;font-weight:600;">${esc(title)}</h2>
  <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${items}</table>`;
}

function renderAlert(kpis: PeriodKpis, dashboardUrl: string, primary: string): string {
  if (kpis.pendingCount + kpis.manualReviewCount === 0) return "";
  const parts: string[] = [];
  if (kpis.pendingCount > 0) parts.push(`${kpis.pendingCount} por validar`);
  if (kpis.manualReviewCount > 0) parts.push(`${kpis.manualReviewCount} a rever manualmente`);
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;">
    <tr><td style="border:1px solid #fde68a;background:#fffbeb;border-radius:8px;padding:12px 14px;font-size:13px;">
      ${esc(parts.join(" · "))}. <a href="${esc(dashboardUrl)}" style="color:${primary};font-weight:600;text-decoration:none;">Rever agora →</a>
    </td></tr>
  </table>`;
}

function renderSummary(kpis: PeriodKpis, delta: Delta, currency: string): string {
  if (kpis.invoicesCount === 0) {
    return "Nenhuma fatura registada neste período.";
  }
  const base = `${kpis.invoicesCount} ${kpis.invoicesCount === 1 ? "fatura registada" : "faturas registadas"}, ${fmtMoney(kpis.totalGross, currency)}`;
  if (!delta.hasPrevious) return `${base}.`;
  const trend = delta.label.startsWith("+") ? "acima" : delta.label.startsWith("-") ? "abaixo" : "idêntico";
  return `${base} (${delta.label} ${trend} do período anterior).`;
}

const KIND_LABELS: Record<EmailPeriodKind, string> = {
  daily: "diário", weekly: "semanal", monthly: "mensal", quarterly: "trimestral",
};

function renderTopExpenses(rows: TopExpenseRow[], currency: string): string {
  if (rows.length === 0) return "";
  const head = `<tr style="background:#f4f4f5;color:#71717a;font-size:11px;text-transform:uppercase;letter-spacing:.04em;">
    <td style="padding:8px 10px;text-align:left;">Data</td>
    <td style="padding:8px 10px;text-align:left;">Fornecedor</td>
    <td style="padding:8px 10px;text-align:left;">Doc.</td>
    <td style="padding:8px 10px;text-align:right;">Valor</td>
  </tr>`;
  const body = rows.map((r) => `<tr style="border-top:1px solid #e5e7eb;">
    <td style="padding:8px 10px;font-size:12px;white-space:nowrap;">${esc(r.doc_date ? r.doc_date.split('-').reverse().join('/') : '—')}</td>
    <td style="padding:8px 10px;">${esc(r.supplier_name ?? '—')}</td>
    <td style="padding:8px 10px;font-family:ui-monospace,monospace;font-size:12px;">${esc(r.doc_number ?? '—')}</td>
    <td style="padding:8px 10px;text-align:right;font-variant-numeric:tabular-nums;">${esc(fmtMoney(r.totalGross, currency))}</td>
  </tr>`).join("");
  return `<h2 style="margin:0 0 10px;font-size:14px;font-weight:600;">Top 10 despesas do período</h2>
  <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">${head}${body}</table>`;
}

function renderTextPlain(input: ReportEmailInput, delta: Delta): string {
  const { kpis, currency, tenantName, periodStartLabel, periodEndLabel } = input;
  const lines = [
    `${tenantName} — relatório ${KIND_LABELS[input.periodKind]}`,
    `Período: ${periodStartLabel} a ${periodEndLabel}`,
    "",
    `Faturas: ${kpis.invoicesCount}`,
    `Total s/ IVA: ${fmtMoney(kpis.totalNet, currency)}`,
    `Total IVA: ${fmtMoney(kpis.totalIva, currency)}`,
    `Total: ${fmtMoney(kpis.totalGross, currency)}`,
  ];
  if (delta.hasPrevious) lines.push(`Variação vs período anterior: ${delta.label}`);
  if (kpis.pendingCount > 0) lines.push(`Por validar: ${kpis.pendingCount}`);
  if (kpis.manualReviewCount > 0) lines.push(`A rever manualmente: ${kpis.manualReviewCount}`);
  lines.push("", `Ver dashboard: ${input.dashboardUrl}`);
  return lines.join("\n");
}

export function renderReportEmail(input: ReportEmailInput): ReportEmailOutput {
  const primary = safeColor(input.primaryColor, "#0E2435");
  const secondary = safeColor(input.secondaryColor, "#BBB388");
  const delta = computeDelta(input.kpis.totalGross, input.previousPeriodTotalGross);
  const kindLabel = KIND_LABELS[input.periodKind];
  const opts = input.contentOptions ?? {};
  const showTotals = opts.totals !== false;
  const showSuppliers = opts.top_suppliers !== false;
  const showCategories = opts.categories !== false;
  const showAlerts = opts.alerts !== false;
  const showTopExpenses = opts.top_expenses === true;

  const configSuffix = input.configName ? ` — ${input.configName}` : "";
  const subject = `Relatório ${kindLabel}${configSuffix} ${input.periodStartLabel} – ${input.periodEndLabel}`;

  const heroLogo = input.logoUrl
    ? `<img src="${esc(input.logoUrl)}" alt="${esc(input.tenantName)}" style="max-height:32px;max-width:120px;display:block;margin-bottom:8px;" />`
    : "";

  const totalsRow = showTotals
    ? `<tr><td style="padding:12px 24px 20px;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
    <tr>
      <td width="50%" valign="top" style="padding-right:6px;">${renderKpiCard("Total s/ IVA", fmtMoney(input.kpis.totalNet, input.currency))}</td>
      <td width="50%" valign="top" style="padding-left:6px;">${renderKpiCard("Total IVA", fmtMoney(input.kpis.totalIva, input.currency))}</td>
    </tr>
    <tr><td colspan="2" style="height:12px;line-height:12px;">&nbsp;</td></tr>
    <tr>
      <td width="50%" valign="top" style="padding-right:6px;">${renderKpiCard("Total", fmtMoney(input.kpis.totalGross, input.currency))}</td>
      <td width="50%" valign="top" style="padding-left:6px;">${renderKpiCard("vs período anterior", delta.label, delta.color)}</td>
    </tr>
  </table>
</td></tr>`
    : "";

  const suppliersRow = showSuppliers && input.topSuppliers.length > 0
    ? `<tr><td style="padding:0 24px 20px;">${renderSuppliersTable(input.topSuppliers, input.currency)}</td></tr>`
    : "";
  const categoryRow = showCategories && input.categoryBreakdown.length > 0
    ? `<tr><td style="padding:0 24px 20px;">${renderBreakdown("Por categoria", input.categoryBreakdown, input.currency, secondary)}</td></tr>`
    : "";
  const topExpensesRow = showTopExpenses && input.topExpenses.length > 0
    ? `<tr><td style="padding:0 24px 20px;">${renderTopExpenses(input.topExpenses, input.currency)}</td></tr>`
    : "";
  const alertRow = showAlerts
    ? `<tr><td style="padding:0 24px 20px;">${renderAlert(input.kpis, input.dashboardUrl, primary)}</td></tr>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="pt-PT">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,sans-serif;color:#111;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f4f4f5;">
<tr><td align="center" style="padding:24px 12px;">
<table width="600" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.06);">

<tr><td style="background:${primary};color:#ffffff;padding:24px;">
  ${heroLogo}
  <h1 style="margin:0;font-size:20px;font-weight:700;">${esc(input.tenantName)}${input.configName ? ` <span style="opacity:.7;font-weight:500;">· ${esc(input.configName)}</span>` : ""}</h1>
  <p style="margin:4px 0 0;font-size:13px;opacity:.85;">Relatório ${esc(kindLabel)} · ${esc(input.periodStartLabel)} – ${esc(input.periodEndLabel)}</p>
</td></tr>

<tr><td style="padding:20px 24px 8px;">
  <p style="margin:0;font-size:14px;line-height:1.5;color:#374151;">${esc(renderSummary(input.kpis, delta, input.currency))}</p>
</td></tr>

${totalsRow}
${suppliersRow}
${categoryRow}
${topExpensesRow}
${alertRow}

<tr><td align="center" style="padding:0 24px 28px;">
  <a href="${esc(input.dashboardUrl)}" style="display:inline-block;background:${primary};color:#ffffff;text-decoration:none;padding:11px 22px;border-radius:8px;font-size:14px;font-weight:600;">Abrir dashboard</a>
</td></tr>

<tr><td style="padding:16px 24px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:11px;color:#71717a;text-align:center;line-height:1.5;">
  Recebe este email porque tem relatórios automáticos ativos no FaturaAI.<br>
  <a href="${esc(input.settingsUrl)}" style="color:#71717a;text-decoration:underline;">Alterar preferências</a>
</td></tr>

</table>
</td></tr>
</table>
</body></html>`;

  return { subject, html, text: renderTextPlain(input, delta) };
}
