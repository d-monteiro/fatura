// Wrapper mínimo para a API Resend. Sem SDK — fetch puro para manter o
// bundle leve e dev-UX em Deno estável.

export interface SendEmailArgs {
  from: string;
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  tags?: Array<{ name: string; value: string }>;
}

export interface SendResult {
  ok: boolean;
  messageId?: string;
  error?: string;
  status?: number;
}

interface ResendResponse {
  id?: string;
  message?: string;
  name?: string;
}

export async function sendEmail(args: SendEmailArgs): Promise<SendResult> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return { ok: false, error: "RESEND_API_KEY_missing" };

  const payload: Record<string, unknown> = {
    from: args.from,
    to: Array.isArray(args.to) ? args.to : [args.to],
    subject: args.subject,
    html: args.html,
    text: args.text,
  };
  if (args.replyTo) payload.reply_to = args.replyTo;
  if (args.tags?.length) payload.tags = args.tags;

  let resp: Response;
  try {
    resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch_failed" };
  }

  let body: ResendResponse = {};
  try {
    body = await resp.json() as ResendResponse;
  } catch {
    // ignored: corpo não-JSON não bloqueia leitura do status
  }

  if (!resp.ok) {
    const msg = body.message ?? body.name ?? `http_${resp.status}`;
    return { ok: false, status: resp.status, error: msg };
  }

  return { ok: true, messageId: body.id };
}
