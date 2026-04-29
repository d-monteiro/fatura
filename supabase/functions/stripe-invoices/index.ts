// ============================================
// Edge Function: stripe-invoices
// ============================================
// Lista os últimos 12 invoices Stripe do tenant do user autenticado.
// Devolve só os campos consumidos pela UI (id, número, data, total,
// estado, hosted URL, PDF URL). Auth: owner/admin do tenant.
//
// Deploy: supabase functions deploy stripe-invoices --project-ref <ref>
// Secrets: STRIPE_SECRET_KEY, SUPABASE_*

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { logEdgeError } from "../_shared/logError.ts";
import { getStripeClient } from "../_shared/stripe.ts";

interface InvoiceSummary {
  id: string;
  number: string | null;
  created: number;
  amount_paid: number;
  amount_due: number;
  currency: string;
  status: string | null;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
  period_start: number | null;
  period_end: number | null;
}

const MAX_LIMIT = 12;

function json(status: number, body: unknown, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "GET" && req.method !== "POST") {
    return json(405, { error: "Method not allowed" }, corsHeaders);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { error: "Unauthorized" }, corsHeaders);

    const userClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json(401, { error: "Unauthorized" }, corsHeaders);

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const { data: membership } = await admin
      .from("tenant_users")
      .select("tenant_id, role")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .in("role", ["owner", "admin"])
      .limit(1)
      .maybeSingle();

    if (!membership) return json(403, { error: "Sem permissões de billing" }, corsHeaders);

    const { data: tenant } = await admin
      .from("tenants")
      .select("id, stripe_customer_id")
      .eq("id", membership.tenant_id)
      .maybeSingle();

    if (!tenant?.stripe_customer_id) {
      return json(200, { invoices: [] satisfies InvoiceSummary[] }, corsHeaders);
    }

    const stripe = getStripeClient();
    const list = await stripe.invoices.list({
      customer: tenant.stripe_customer_id,
      limit: MAX_LIMIT,
    });

    const invoices: InvoiceSummary[] = list.data.map((inv) => ({
      id: inv.id ?? "",
      number: inv.number ?? null,
      created: inv.created,
      amount_paid: inv.amount_paid,
      amount_due: inv.amount_due,
      currency: inv.currency,
      status: inv.status ?? null,
      hosted_invoice_url: inv.hosted_invoice_url ?? null,
      invoice_pdf: inv.invoice_pdf ?? null,
      period_start: inv.period_start ?? null,
      period_end: inv.period_end ?? null,
    }));

    return json(200, { invoices }, corsHeaders);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erro interno";
    await logEdgeError({
      functionName: "stripe-invoices",
      message: msg,
      error,
      httpStatus: 500,
    });
    return json(500, { error: msg }, corsHeaders);
  }
});
