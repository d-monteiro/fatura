// ============================================
// Edge Function: submit-enterprise-lead
// ============================================
// Recebe o contacto do plano Empresarial com rate-limit por IP + honeypot.
// Antes o frontend fazia INSERT directo com RLS permissiva —
// ataque DDOS/phishing trivial. Agora só esta função pode inserir.
// Deploy: supabase functions deploy submit-enterprise-lead --no-verify-jwt --project-ref <ref>

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

const RATE_LIMIT_PER_HOUR = 3;
const ENDPOINT_KEY = "submit-enterprise-lead";

interface LeadBody {
  company_name?: unknown;
  contact_name?: unknown;
  email?: unknown;
  phone?: unknown;
  sector?: unknown;
  country?: unknown;
  invoices_per_month?: unknown;
  availability?: unknown;
  notes?: unknown;
  website?: unknown; // honeypot — preenchido = bot
}

function json(status: number, body: unknown, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function str(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function validEmail(email: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) && email.length <= 200;
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" }, corsHeaders);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const body = (await req.json()) as LeadBody;

    // Honeypot: campo invisível no form. Bots preenchem.
    if (body.website !== undefined && body.website !== "") {
      // Fingir sucesso para não dar sinal ao bot
      return json(200, { ok: true }, corsHeaders);
    }

    const companyName = str(body.company_name, 200);
    const contactName = str(body.contact_name, 200);
    const email = str(body.email, 200);
    const phone = str(body.phone, 40);
    const sector = str(body.sector, 80);
    const country = str(body.country, 3);
    const availability = str(body.availability, 200);
    const notes = str(body.notes, 2000);
    const invoicesPerMonth = typeof body.invoices_per_month === "number" && body.invoices_per_month >= 0
      ? Math.floor(body.invoices_per_month)
      : null;

    if (!companyName || !contactName || !email) {
      return json(400, { error: "Campos obrigatórios em falta" }, corsHeaders);
    }
    if (!validEmail(email)) {
      return json(400, { error: "Email inválido" }, corsHeaders);
    }

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // Rate limit por IP (X-Forwarded-For ou Deno connection)
    const forwarded = req.headers.get("x-forwarded-for") || "";
    const clientIp = forwarded.split(",")[0].trim() || "unknown";
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const { count } = await admin
      .from("edge_rate_limits")
      .select("*", { count: "exact", head: true })
      .eq("endpoint", ENDPOINT_KEY)
      .eq("client_id", clientIp)
      .gte("created_at", hourAgo);

    if ((count ?? 0) >= RATE_LIMIT_PER_HOUR) {
      return json(429, { error: "Demasiados pedidos. Tenta mais tarde." }, corsHeaders);
    }

    await admin.from("edge_rate_limits").insert({ endpoint: ENDPOINT_KEY, client_id: clientIp });

    const { error: insertError } = await admin.from("enterprise_leads").insert({
      company_name: companyName,
      contact_name: contactName,
      email,
      phone,
      sector,
      country: country ?? "PT",
      invoices_per_month: invoicesPerMonth,
      availability,
      notes,
      status: "new",
    });

    if (insertError) {
      console.error("[submit-enterprise-lead] insert error", insertError);
      return json(500, { error: "Falha a registar" }, corsHeaders);
    }

    // Best-effort Slack notify
    const slackWebhook = Deno.env.get("SLACK_WEBHOOK_URL");
    if (slackWebhook) {
      try {
        await fetch(slackWebhook, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: `Novo lead Empresarial: ${companyName} (${contactName} <${email}>) · ${sector ?? "—"} · ${invoicesPerMonth ?? "?"} faturas/mês`,
          }),
        });
      } catch (e) {
        console.warn("[submit-enterprise-lead] slack notify failed", e);
      }
    }

    return json(200, { ok: true }, corsHeaders);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erro interno";
    return json(500, { error: msg }, corsHeaders);
  }
});
