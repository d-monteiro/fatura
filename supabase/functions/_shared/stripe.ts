// Factory partilhada do cliente Stripe para Edge Functions.
// Usa fetch HTTP client (Deno) e Subtle Crypto provider (necessário para
// webhooks — constructEventAsync não aceita crypto síncrono).

import Stripe from "https://esm.sh/stripe@17.4.0?target=denonext";

const STRIPE_API_VERSION = "2024-12-18.acacia";

let cachedClient: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (cachedClient) return cachedClient;
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) throw new Error("STRIPE_SECRET_KEY não definida");
  cachedClient = new Stripe(key, {
    apiVersion: STRIPE_API_VERSION,
    httpClient: Stripe.createFetchHttpClient(),
  });
  return cachedClient;
}

export function getCryptoProvider() {
  return Stripe.createSubtleCryptoProvider();
}

export { Stripe };
