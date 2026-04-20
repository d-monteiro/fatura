// ============================================
// Edge Function: stripe-portal
// ============================================
// Cria sessão do Stripe Customer Portal para o user autenticado gerir
// a subscrição (trocar plano, cancelar, actualizar cartão, ver faturas).
//
// Deploy: supabase functions deploy stripe-portal --project-ref <ref>
// Secrets: STRIPE_SECRET_KEY, SUPABASE_*

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders, getFrontendUrl } from "../_shared/cors.ts";
import { logEdgeError } from "../_shared/logError.ts";
import { getStripeClient } from "../_shared/stripe.ts";

function json(status: number, body: unknown, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" }, corsHeaders);

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
      return json(404, { error: "Tenant sem subscrição Stripe" }, corsHeaders);
    }

    const stripe = getStripeClient();
    const session = await stripe.billingPortal.sessions.create({
      customer: tenant.stripe_customer_id,
      return_url: `${getFrontendUrl()}/billing`,
      locale: "pt",
    });

    return json(200, { portal_url: session.url }, corsHeaders);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erro interno";
    await logEdgeError({
      functionName: "stripe-portal",
      message: msg,
      error,
      httpStatus: 500,
    });
    return json(500, { error: msg }, corsHeaders);
  }
});
