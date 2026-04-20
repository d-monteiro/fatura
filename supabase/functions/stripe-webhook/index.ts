// ============================================
// Edge Function: stripe-webhook
// ============================================
// Recebe eventos do Stripe e sincroniza estado da subscrição no tenant.
// NÃO usa CORS (Stripe chama server-to-server) nem JWT (stripe-signature
// autentica o pedido). Deploy com --no-verify-jwt.
//
// Eventos tratados:
//   checkout.session.completed        → marca subscrição inicial (fallback)
//   customer.subscription.created     → primeira activação
//   customer.subscription.updated     → troca de plano / estado
//   customer.subscription.deleted     → cancelado
//   invoice.payment_failed            → past_due
//
// Deploy: supabase functions deploy stripe-webhook --project-ref <ref> --no-verify-jwt
// Secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, SUPABASE_*

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { getStripeClient, getCryptoProvider, Stripe } from "../_shared/stripe.ts";
import { logEdgeError } from "../_shared/logError.ts";

type PlanStatus = "trialing" | "active" | "past_due" | "canceled" | "paused";

interface TenantPatch {
  stripe_subscription_id?: string | null;
  stripe_customer_id?: string;
  plan_status?: PlanStatus;
  plan_id?: string;
  trial_ends_at?: string | null;
}

function mapStripeStatusToPlanStatus(s: Stripe.Subscription.Status): PlanStatus {
  switch (s) {
    case "active":
    case "trialing":
      return s;
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "canceled";
    case "paused":
      return "paused";
    case "incomplete":
      return "past_due";
    default:
      return "canceled";
  }
}

async function resolveTenantId(
  admin: SupabaseClient,
  subscription: Stripe.Subscription,
): Promise<string | null> {
  const metaTenant = subscription.metadata?.tenant_id;
  if (typeof metaTenant === "string" && metaTenant) return metaTenant;

  const customerId = typeof subscription.customer === "string"
    ? subscription.customer
    : subscription.customer?.id;
  if (!customerId) return null;

  const { data } = await admin
    .from("tenants")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  return data?.id ?? null;
}

async function resolvePlanId(admin: SupabaseClient, priceId: string | null | undefined): Promise<string | null> {
  if (!priceId) return null;
  const { data } = await admin
    .from("plans")
    .select("id")
    .or(`stripe_price_id_monthly.eq.${priceId},stripe_price_id_yearly.eq.${priceId}`)
    .maybeSingle();
  return data?.id ?? null;
}

async function syncSubscription(admin: SupabaseClient, subscription: Stripe.Subscription): Promise<void> {
  const tenantId = await resolveTenantId(admin, subscription);
  if (!tenantId) {
    await logEdgeError({
      functionName: "stripe-webhook",
      message: "sem tenant_id para subscription",
      level: "warn",
      metadata: { subscription_id: subscription.id, customer: subscription.customer },
    });
    return;
  }

  const priceId = subscription.items.data[0]?.price?.id ?? null;
  const planId = await resolvePlanId(admin, priceId);
  const status = mapStripeStatusToPlanStatus(subscription.status);

  const patch: TenantPatch = {
    stripe_subscription_id: subscription.id,
    plan_status: status,
  };
  if (planId) patch.plan_id = planId;

  // Em active vindo do Stripe: limpar trial local (Stripe gere agora)
  if (status === "active") patch.trial_ends_at = null;
  if (status === "canceled") patch.stripe_subscription_id = null;

  const customerId = typeof subscription.customer === "string"
    ? subscription.customer
    : subscription.customer?.id;
  if (customerId) patch.stripe_customer_id = customerId;

  const { error } = await admin.from("tenants").update(patch).eq("id", tenantId);
  if (error) {
    await logEdgeError({
      functionName: "stripe-webhook",
      message: "update tenant falhou",
      error,
      tenantId,
      metadata: { subscription_id: subscription.id },
    });
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const signature = req.headers.get("stripe-signature");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!signature || !webhookSecret) {
    return new Response("Missing signature or secret", { status: 400 });
  }

  const rawBody = await req.text();
  const stripe = getStripeClient();
  const cryptoProvider = getCryptoProvider();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      webhookSecret,
      undefined,
      cryptoProvider,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "signature inválida";
    await logEdgeError({
      functionName: "stripe-webhook",
      message: `verify signature falhou: ${msg}`,
      level: "warn",
    });
    return new Response(`Webhook Error: ${msg}`, { status: 400 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // Idempotência: rejeitar eventos já processados. Stripe retry quando
  // não recebe 2xx — `ON CONFLICT DO NOTHING` via upsert ignoreDuplicates.
  const { error: dedupError, count } = await admin
    .from("stripe_webhook_events")
    .upsert(
      { event_id: event.id, event_type: event.type },
      { onConflict: "event_id", ignoreDuplicates: true, count: "exact" },
    );
  if (dedupError) {
    await logEdgeError({
      functionName: "stripe-webhook",
      message: "falha a gravar event idempotency",
      error: dedupError,
      metadata: { event_id: event.id, event_type: event.type },
    });
  } else if (count === 0) {
    // Já processado — ack sem reprocessar
    return new Response(JSON.stringify({ received: true, duplicate: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await syncSubscription(admin, event.data.object as Stripe.Subscription);
        break;

      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const subscriptionId = typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id;
        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          await syncSubscription(admin, subscription);
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = typeof invoice.subscription === "string"
          ? invoice.subscription
          : invoice.subscription?.id;
        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          await syncSubscription(admin, subscription);
        }
        break;
      }

      default:
        // evento não tratado — devolve 200 para o Stripe não reenviar
        break;
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erro interno";
    await logEdgeError({
      functionName: "stripe-webhook",
      message: msg,
      error,
      httpStatus: 500,
      metadata: { event_type: event.type, event_id: event.id },
    });
    return new Response(`Webhook handler error: ${msg}`, { status: 500 });
  }
});
