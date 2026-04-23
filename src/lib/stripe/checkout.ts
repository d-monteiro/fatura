// Client helper para iniciar Stripe Checkout ou abrir Customer Portal.
// Redireciona a janela actual para o URL devolvido pelo Stripe.

import { supabase } from "@/lib/supabase/client";
import type { BillingCycle } from "@/types/billing";

interface CheckoutInput {
  planSlug: string;
  billingCycle: BillingCycle;
}

export async function startCheckout({ planSlug, billingCycle }: CheckoutInput): Promise<void> {
  const { data, error } = await supabase.functions.invoke<{ checkout_url: string }>(
    "stripe-checkout",
    { body: { plan_slug: planSlug, billing_cycle: billingCycle } },
  );
  if (error) throw new Error(error.message || "Falha ao iniciar checkout");
  if (!data?.checkout_url) throw new Error("Checkout URL em falta");
  window.location.href = data.checkout_url;
}

export async function openBillingPortal(): Promise<void> {
  const { data, error } = await supabase.functions.invoke<{ portal_url: string }>(
    "stripe-portal",
    { body: {} },
  );
  if (error) throw new Error(error.message || "Falha ao abrir portal");
  if (!data?.portal_url) throw new Error("Portal URL em falta");
  window.location.href = data.portal_url;
}
