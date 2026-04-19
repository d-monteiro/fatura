// ============================================
// Edge Function: slack-notify
// Single Slack channel — uses Block Kit for clean rendering.
// Topics: 'lead' | 'ticket' | 'alert' | 'signup'
// Secrets: SLACK_WEBHOOK_URL
// ============================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getAllowedOrigins, getFrontendUrl } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SLACK_WEBHOOK_URL = Deno.env.get("SLACK_WEBHOOK_URL");

function cors(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  const allowed = getAllowedOrigins();
  const match = allowed.includes(origin) ? origin : allowed[0];
  return {
    "Access-Control-Allow-Origin": match,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

// Botões "Abrir no admin" têm de apontar SEMPRE para a produção (FRONTEND_URL
// ou fallback fatura.flowzi.pt). Se usarmos o origin do request, uma chamada
// de dev manda `http://localhost:5173/admin/...` para o Slack do team.

interface LeadPayload {
  company_name: string;
  contact_name: string;
  email: string;
  phone?: string;
  sector?: string;
  country?: string;
  invoices_per_month?: number;
  availability?: string;
  notes?: string;
}

interface TicketPayload {
  tenant_name: string;
  plan_name?: string;
  subject: string;
  category: string;
  priority: string;
  email: string;
  description: string;
  ticket_id: string;
}

interface AlertPayload {
  level: "info" | "warn" | "error" | "fatal";
  source: string;
  function_name?: string;
  message: string;
}

interface SignupPayload {
  tenant_name: string;
  plan_name: string;
  email: string;
  country?: string;
}

type Topic = "lead" | "ticket" | "alert" | "signup";
type LegacyChannel = "leads" | "tickets" | "alerts" | "signups";

type Body =
  | { channel: "leads" | "lead"; payload: LeadPayload }
  | { channel: "tickets" | "ticket"; payload: TicketPayload }
  | { channel: "alerts" | "alert"; payload: AlertPayload }
  | { channel: "signups" | "signup"; payload: SignupPayload };

function normalizeTopic(channel: Topic | LegacyChannel): Topic {
  if (channel === "leads") return "lead";
  if (channel === "tickets") return "ticket";
  if (channel === "alerts") return "alert";
  if (channel === "signups") return "signup";
  return channel;
}

// Slack Block Kit types (minimal subset we use)
type Block =
  | { type: "header"; text: { type: "plain_text"; text: string; emoji?: boolean } }
  | { type: "section"; text?: { type: "mrkdwn"; text: string }; fields?: Array<{ type: "mrkdwn"; text: string }> }
  | { type: "divider" }
  | { type: "context"; elements: Array<{ type: "mrkdwn"; text: string }> }
  | { type: "actions"; elements: Array<{ type: "button"; text: { type: "plain_text"; text: string }; url: string; style?: "primary" | "danger" }> };

function truncate(s: string, max = 600): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function line(label: string, value: string): string {
  return `*${label}:* ${value}`;
}

function linkButton(text: string, url: string, primary = false): Block {
  return {
    type: "actions",
    elements: [{
      type: "button",
      text: { type: "plain_text", text },
      url,
      ...(primary ? { style: "primary" as const } : {}),
    }],
  };
}

function buildLead(p: LeadPayload, appUrl: string): { text: string; blocks: Block[] } {
  const lines = [line("Empresa", p.company_name)];
  const contact = [p.contact_name, p.email, p.phone].filter(Boolean).join(" · ");
  lines.push(line("Contacto", contact));
  if (p.sector) lines.push(line("Setor", p.sector));
  if (p.invoices_per_month) lines.push(line("Volume", `~${p.invoices_per_month} faturas/mês`));
  if (p.availability) lines.push(line("Disponibilidade", p.availability));
  if (p.notes) lines.push(line("Notas", truncate(p.notes, 300)));

  return {
    text: `Lead: ${p.company_name}`,
    blocks: [
      { type: "header", text: { type: "plain_text", text: "Novo lead empresarial", emoji: false } },
      { type: "section", text: { type: "mrkdwn", text: lines.join("\n") } },
      linkButton("Abrir no admin", `${appUrl}/admin/onboarding`, true),
    ],
  };
}

function buildSignup(p: SignupPayload): { text: string; blocks: Block[] } {
  const lines = [
    line("Empresa", p.tenant_name),
    line("Plano", p.plan_name),
    line("Admin", p.email),
  ];
  return {
    text: `Signup: ${p.tenant_name} (${p.plan_name})`,
    blocks: [
      { type: "header", text: { type: "plain_text", text: "Novo signup", emoji: false } },
      { type: "section", text: { type: "mrkdwn", text: lines.join("\n") } },
    ],
  };
}

function buildTicket(p: TicketPayload, appUrl: string): { text: string; blocks: Block[] } {
  const lines = [
    line("Cliente", p.plan_name ? `${p.tenant_name} · ${p.plan_name}` : p.tenant_name),
    line("Utilizador", p.email),
    line("Categoria", `${p.category} · ${p.priority}`),
  ];
  return {
    text: `Ticket [${p.priority}]: ${p.subject}`,
    blocks: [
      { type: "header", text: { type: "plain_text", text: `Ticket · ${p.priority}`, emoji: false } },
      { type: "section", text: { type: "mrkdwn", text: `*${p.subject}*\n${lines.join("\n")}` } },
      { type: "section", text: { type: "mrkdwn", text: truncate(p.description, 800) } },
      { type: "context", elements: [{ type: "mrkdwn", text: `ID \`${p.ticket_id}\`` }] },
      linkButton("Abrir no admin", `${appUrl}/admin/tickets`),
    ],
  };
}

function buildAlert(p: AlertPayload): { text: string; blocks: Block[] } {
  const origin = p.function_name ? `${p.source} · ${p.function_name}` : p.source;
  return {
    text: `[${p.level.toUpperCase()}] ${p.source}: ${p.message}`,
    blocks: [
      { type: "header", text: { type: "plain_text", text: `Alerta · ${p.level.toUpperCase()}`, emoji: false } },
      { type: "section", text: { type: "mrkdwn", text: `${line("Origem", origin)}\n${truncate(p.message, 1500)}` } },
    ],
  };
}

Deno.serve(async (req: Request) => {
  const corsHeaders = cors(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!SLACK_WEBHOOK_URL) {
      console.log("[slack-notify] SLACK_WEBHOOK_URL not configured, skipping");
      return new Response(
        JSON.stringify({ ok: false, reason: "webhook_not_configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json() as Body;
    const topic = normalizeTopic(body.channel);
    const adminUrl = getFrontendUrl();

    let message: { text: string; blocks: Block[] };
    switch (topic) {
      case "lead": message = buildLead(body.payload as LeadPayload, adminUrl); break;
      case "signup": message = buildSignup(body.payload as SignupPayload); break;
      case "ticket": message = buildTicket(body.payload as TicketPayload, adminUrl); break;
      case "alert": message = buildAlert(body.payload as AlertPayload); break;
      default: {
        return new Response(JSON.stringify({ ok: false, error: "unknown topic" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const slackResp = await fetch(SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
    });

    if (!slackResp.ok) {
      const errText = await slackResp.text();
      console.error("[slack-notify] Slack API error:", slackResp.status, errText);
      return new Response(
        JSON.stringify({ ok: false, reason: "slack_api_error", status: slackResp.status }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ ok: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[slack-notify] error:", error);
    return new Response(
      JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
