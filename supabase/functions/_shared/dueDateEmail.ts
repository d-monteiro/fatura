// Email brandado por tenant para o alerta de prazos de pagamento (T-3d).
// Reutiliza a estética do reportEmail: tabela central 600px, primary no header.

export interface DueDateRow {
  supplierName: string;
  docNumber: string | null;
  dueDateLabel: string;   // DD/MM/AAAA
  daysLeft: number;            // negativo = vencida há N dias
  amountTotal: number;
  url: string;                 // link directo para a fatura
}

export interface DueDateEmailInput {
  tenantName: string;
  primaryColor: string;
  secondaryColor: string;
  logoUrl: string | null;
  currency: string;
  rows: DueDateRow[];
  totalTtc: number;
  dashboardUrl: string;
  settingsUrl: string;
}

export interface DueDateEmailOutput {
  subject: string;
  html: string;
  text: string;
}

const HEX6 = /^#[0-9A-Fa-f]{6}$/;

function safeColor(v: string | null | undefined, fallback: string): string {
  return v && HEX6.test(v) ? v : fallback;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function fmtMoney(value: number, currency: string): string {
  const num = new Intl.NumberFormat("pt-PT", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(value);
  return `${num} ${currency}`;
}

function daysLabel(days: number): string {
  if (days < 0) return `vencida há ${Math.abs(days)}d`;
  if (days === 0) return "vence hoje";
  if (days === 1) return "vence amanhã";
  return `em ${days}d`;
}

function renderRow(row: DueDateRow, currency: string, primary: string): string {
  const overdue = row.daysLeft < 0;
  const soon = row.daysLeft >= 0 && row.daysLeft <= 1;
  const chipBg = overdue ? "#fee2e2" : soon ? "#fef3c7" : "#e0e7ff";
  const chipFg = overdue ? "#991b1b" : soon ? "#92400e" : "#3730a3";

  return `<tr style="border-top:1px solid #e5e7eb;">
    <td style="padding:10px 10px 10px 14px;font-size:13px;vertical-align:top;">
      <div style="font-weight:600;color:#111;">${esc(row.supplierName)}</div>
      ${row.docNumber ? `<div style="font-family:ui-monospace,Menlo,monospace;color:#71717a;font-size:11px;margin-top:2px;">${esc(row.docNumber)}</div>` : ""}
    </td>
    <td style="padding:10px;font-size:12px;text-align:center;vertical-align:top;white-space:nowrap;">
      <div>${esc(row.dueDateLabel)}</div>
      <span style="display:inline-block;margin-top:4px;padding:2px 8px;border-radius:10px;background:${chipBg};color:${chipFg};font-size:11px;font-weight:500;">${esc(daysLabel(row.daysLeft))}</span>
    </td>
    <td style="padding:10px 14px 10px 10px;font-size:13px;text-align:right;vertical-align:top;font-variant-numeric:tabular-nums;white-space:nowrap;">
      <div style="font-weight:600;">${esc(fmtMoney(row.amountTotal, currency))}</div>
      <a href="${esc(row.url)}" style="color:${primary};font-size:11px;text-decoration:none;">Ver fatura →</a>
    </td>
  </tr>`;
}

export function renderDueDateEmail(input: DueDateEmailInput): DueDateEmailOutput {
  const primary = safeColor(input.primaryColor, "#0E2435");
  const count = input.rows.length;
  const subject = `${count} ${count === 1 ? "fatura a vencer" : "faturas a vencer"} — ${input.tenantName}`;

  const heroLogo = input.logoUrl
    ? `<img src="${esc(input.logoUrl)}" alt="${esc(input.tenantName)}" style="max-height:32px;max-width:120px;display:block;margin-bottom:8px;" />`
    : "";

  const rowsHtml = input.rows.map((r) => renderRow(r, input.currency, primary)).join("");

  const tableHead = `<tr style="background:#f4f4f5;color:#71717a;font-size:11px;text-transform:uppercase;letter-spacing:.04em;">
    <td style="padding:8px 14px;text-align:left;">Fornecedor</td>
    <td style="padding:8px 10px;text-align:center;">Vencimento</td>
    <td style="padding:8px 14px 8px 10px;text-align:right;">Total</td>
  </tr>`;

  const html = `<!DOCTYPE html>
<html lang="pt-PT"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,sans-serif;color:#111;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f4f4f5;">
<tr><td align="center" style="padding:24px 12px;">
<table width="600" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.06);">

<tr><td style="background:${primary};color:#ffffff;padding:24px;">
  ${heroLogo}
  <h1 style="margin:0;font-size:20px;font-weight:700;">Prazos de pagamento</h1>
  <p style="margin:4px 0 0;font-size:13px;opacity:.85;">${count} ${count === 1 ? "fatura a vencer" : "faturas a vencer"} nos próximos dias · ${esc(fmtMoney(input.totalTtc, input.currency))}</p>
</td></tr>

<tr><td style="padding:16px 14px 8px;">
  <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
    ${tableHead}${rowsHtml}
  </table>
</td></tr>

<tr><td align="center" style="padding:12px 24px 28px;">
  <a href="${esc(input.dashboardUrl)}" style="display:inline-block;background:${primary};color:#ffffff;text-decoration:none;padding:11px 22px;border-radius:8px;font-size:14px;font-weight:600;">Abrir FaturaAI</a>
</td></tr>

<tr><td style="padding:16px 24px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:11px;color:#71717a;text-align:center;line-height:1.5;">
  Recebe este email porque tem alertas de pagamento ativos. Cada fatura é notificada apenas uma vez — editar a data de vencimento volta a ativar o alerta.<br>
  <a href="${esc(input.settingsUrl)}" style="color:#71717a;text-decoration:underline;">Alterar preferências</a>
</td></tr>

</table>
</td></tr>
</table>
</body></html>`;

  const textLines = [
    `${input.tenantName} — ${subject}`,
    "",
    ...input.rows.map((r) => `• ${r.supplierName}${r.docNumber ? ` (${r.docNumber})` : ""} — ${r.dueDateLabel} (${daysLabel(r.daysLeft)}) — ${fmtMoney(r.amountTotal, input.currency)}`),
    "",
    `Total: ${fmtMoney(input.totalTtc, input.currency)}`,
    "",
    `Abrir: ${input.dashboardUrl}`,
  ];

  return { subject, html, text: textLines.join("\n") };
}
