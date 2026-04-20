// ============================================
// Edge Function: stripe-checkout
// ============================================
// Cria uma Stripe Checkout Session para o tenant do user autenticado.
// Se o tenant ainda não tem stripe_customer_id, cria o Customer primeiro
// (com email + name + metadata.tenant_id) e persiste na BD.
//
// Deploy: supabase functions deploy stripe-checkout --project-ref <ref>
// Secrets: STRIPE_SECRET_KEY, SUPABASE_*

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders, getFrontendUrl } from "../_shared/cors.ts";
import { logEdgeError } from "../_shared/logError.ts";
import { getStripeClient } from "../_shared/stripe.ts";

interface CheckoutBody {
  plan_slug?: unknown;
  billing_cycle?: unknown;
}

type Cycle = "monthly" | "yearly";

function json(status: number, body: unknown, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function parseCycle(v: unknown): Cycle | null {
  return v === "monthly" || v === "yearly" ? v : null;
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

    const body = (await req.json()) as CheckoutBody;
    const planSlug = typeof body.plan_slug === "string" ? body.plan_slug : null;
    const cycle = parseCycle(body.billing_cycle);
    if (!planSlug || !cycle) {
      return json(400, { error: "plan_slug e billing_cycle obrigatórios" }, corsHeaders);
    }
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // Encontrar tenant do user com role owner/admin (só quem gere billing)
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
      .select("id, name, stripe_customer_id, stripe_subscription_id")
      .eq("id", membership.tenant_id)
      .maybeSingle();

    if (!tenant) return json(404, { error: "Tenant não encontrado" }, corsHeaders);

    // Se já há subscrição activa, não permitir nova checkout — usar portal
    if (tenant.stripe_subscription_id) {
      return json(409, {
        error: "Subscrição já existe. Use o portal para alterar plano.",
      }, corsHeaders);
    }

    const { data: plan } = await admin
      .from("plans")
      .select("id, slug, is_custom_pricing, stripe_price_id_monthly, stripe_price_id_yearly")
      .eq("slug", planSlug)
      .eq("is_active", true)
      .maybeSingle();

    if (!plan) return json(404, { error: "Plano não encontrado" }, corsHeaders);
    if (plan.is_custom_pricing) {
      return json(400, { error: "Plano sob orçamento não passa por checkout automático" }, corsHeaders);
    }

    const priceId = cycle === "yearly" ? plan.stripe_price_id_yearly : plan.stripe_price_id_monthly;
    if (!priceId) {
      return json(400, { error: `Plano ${planSlug} não tem price Stripe para ciclo ${cycle}` }, corsHeaders);
    }

    const stripe = getStripeClient();
    const frontendUrl = getFrontendUrl();

    let customerId = tenant.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create(
        {
          email: user.email ?? undefined,
          name: tenant.name,
          metadata: { tenant_id: tenant.id, user_id: user.id },
        },
        { idempotencyKey: `customer_create_${tenant.id}` },
      );
      customerId = customer.id;
      const { error: upErr } = await admin
        .from("tenants")
        .update({ stripe_customer_id: customerId })
        .eq("id", tenant.id);
      if (upErr) {
        await logEdgeError({
          functionName: "stripe-checkout",
          message: "falha a persistir stripe_customer_id",
          error: upErr,
          tenantId: tenant.id,
          userId: user.id,
        });
      }
    }

    const successUrl = `${frontendUrl}/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${frontendUrl}/billing?checkout=cancel`;
    console.log("[stripe-checkout] urls", { frontendUrl, successUrl, cancelUrl });

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      allow_promotion_codes: true,
      subscription_data: {
        metadata: { tenant_id: tenant.id, plan_slug: plan.slug, billing_cycle: cycle },
      },
      client_reference_id: tenant.id,
      locale: "pt",
    });

    if (!session.url) {
      return json(500, { error: "Stripe não devolveu URL de checkout" }, corsHeaders);
    }

    return json(200, { checkout_url: session.url, session_id: session.id }, corsHeaders);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erro interno";
    await logEdgeError({
      functionName: "stripe-checkout",
      message: msg,
      error,
      httpStatus: 500,
    });
    return json(500, { error: msg }, corsHeaders);
  }
});
