// Template HTML do email de convite. Usa primary_color do tenant no
// header e CTA para alinhar com o branding. Versão text/plain simples
// para clientes que não renderizam HTML.

interface RenderArgs {
  tenantName: string;
  tenantLogoUrl: string | null;
  primaryColor: string;
  inviterEmail: string;
  role: 'member' | 'readonly';
  inviteUrl: string;
  expiresAt: string;
}

const ROLE_PT: Record<RenderArgs['role'], { label: string; description: string }> = {
  member: {
    label: 'Membro',
    description: 'Vais poder adicionar e editar faturas, sincronizar emails, gerir fornecedores e categorias.',
  },
  readonly: {
    label: 'Consulta (só leitura)',
    description: 'Vais poder ver e exportar todas as faturas, mas sem editar nada — perfeito para o teu contabilista.',
  },
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatExpiry(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function renderInviteEmail(args: RenderArgs): { html: string; text: string; subject: string } {
  const role = ROLE_PT[args.role];
  const expires = formatExpiry(args.expiresAt);
  const tenant = escapeHtml(args.tenantName);
  const inviter = escapeHtml(args.inviterEmail);
  const color = /^#[0-9A-Fa-f]{6}$/.test(args.primaryColor) ? args.primaryColor : '#0E2435';
  const url = args.inviteUrl;
  const logoBlock = args.tenantLogoUrl
    ? `<img src="${escapeHtml(args.tenantLogoUrl)}" alt="${tenant}" height="40" style="display:block;margin:0 auto;max-height:40px;">`
    : `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,sans-serif;color:#fff;font-size:18px;font-weight:600;letter-spacing:-0.01em;">FaturaAI</div>`;

  const subject = `${args.inviterEmail} convidou-te para ${args.tenantName}`;

  const html = `<!DOCTYPE html>
<html lang="pt-PT">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f7f7f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,sans-serif;color:#1a1a1a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7f8;">
    <tr><td align="center" style="padding:40px 20px;">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <tr><td style="background:${color};padding:32px 40px;text-align:center;">
          ${logoBlock}
        </td></tr>
        <tr><td style="padding:40px;">
          <h1 style="margin:0 0 16px;font-size:24px;font-weight:600;color:#0f172a;line-height:1.3;">Foste convidado para ${tenant}</h1>
          <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#475569;">
            <strong>${inviter}</strong> convidou-te para aceder a <strong>${tenant}</strong> no FaturaAI como <strong>${role.label}</strong>.
          </p>
          <p style="margin:0 0 32px;font-size:15px;line-height:1.6;color:#475569;">
            ${role.description}
          </p>
          <div style="text-align:center;margin:32px 0;">
            <a href="${url}" style="display:inline-block;padding:14px 32px;background:${color};color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;">
              Aceitar convite
            </a>
          </div>
          <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#94a3b8;">
            Se ainda não tens conta no FaturaAI, podes criar uma com email + password ou entrar com a tua conta Google. Se já tens conta, basta fazer login.
          </p>
          <p style="margin:12px 0 0;font-size:13px;line-height:1.6;color:#94a3b8;">
            Este convite expira a <strong>${expires}</strong>. Se não reconheces quem te convidou, podes ignorar este email — não é gerada nenhuma conta sem o teu consentimento.
          </p>
          <p style="margin:24px 0 0;font-size:12px;color:#cbd5e1;word-break:break-all;">
            Ou copia este link para o browser: ${url}
          </p>
        </td></tr>
        <tr><td style="padding:24px 40px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;font-size:12px;color:#94a3b8;">
          FaturaAI &middot; fatura.flowzi.pt
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    `Foste convidado para ${args.tenantName}`,
    '',
    `${args.inviterEmail} convidou-te para aceder a ${args.tenantName} no FaturaAI como ${role.label}.`,
    '',
    role.description,
    '',
    `Aceita o convite: ${url}`,
    '',
    `Expira a ${expires}. Se não reconheces quem te convidou, podes ignorar este email.`,
  ].join('\n');

  return { html, text, subject };
}
