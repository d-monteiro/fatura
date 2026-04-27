// ============================================
// Edge Function: resolve-invite (PÚBLICA, sem JWT)
// Devolve metadata de um convite pelo token, para a landing page.
// Rate-limited por IP (20 req/min) — token de 32 bytes é resistente a
// brute-force, mas evitamos enumeração descontrolada.
//
// Body: { token: string }
// Resp 200: { email, role, tenant_name, tenant_logo_url, tenant_primary_color,
//             inviter_email, expires_at, status: 'pending' }
// Resp 410: { status: 'expired' | 'revoked' | 'accepted' }
// Resp 404: invite inexistente
// Resp 429: rate limit
// ============================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const RATE_LIMIT_WINDOW_SEC = 60;
const RATE_LIMIT_MAX = 20;

function json(status: number, body: unknown, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function clientIp(req: Request): string {
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf;
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  const fwd = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  return fwd || "unknown";
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" }, corsHeaders);

  let body: { token?: string };
  try { body = await req.json(); } catch { return json(400, { error: "Invalid JSON" }, corsHeaders); }

  const token = body.token?.trim();
  if (!token || token.length < 16) {
    return json(400, { error: "Token inválido" }, corsHeaders);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  // Rate limit por IP: contar requests dos últimos 60s
  const ip = clientIp(req);
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_SEC * 1000).toISOString();
  const { count: recent } = await admin.from("edge_rate_limits")
    .select("*", { count: "exact", head: true })
    .eq("endpoint", "resolve-invite")
    .eq("client_id", ip)
    .gte("created_at", windowStart);
  if ((recent ?? 0) >= RATE_LIMIT_MAX) {
    return json(429, { error: "Demasiados pedidos. Tenta daqui a 1 minuto." }, corsHeaders);
  }
  await admin.from("edge_rate_limits").insert({ endpoint: "resolve-invite", client_id: ip });

  const tokenHash = await sha256Hex(token);

  const { data: invite } = await admin.from("tenant_invites")
    .select("id, tenant_id, email, role, expires_at, accepted_at, revoked_at, invited_by")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (!invite) return json(404, { status: "not_found" }, corsHeaders);

  if (invite.accepted_at) return json(410, { status: "accepted" }, corsHeaders);
  if (invite.revoked_at) return json(410, { status: "revoked" }, corsHeaders);
  if (new Date(invite.expires_at as string) < new Date()) {
    return json(410, { status: "expired" }, corsHeaders);
  }

  // Tenant + inviter info para a landing
  const [tenantRes, inviterRes] = await Promise.all([
    admin.from("tenants")
      .select("name, logo_url, primary_color")
      .eq("id", invite.tenant_id)
      .maybeSingle(),
    admin.schema("auth").from("users")
      .select("email")
      .eq("id", invite.invited_by)
      .maybeSingle(),
  ]);

  return json(200, {
    status: "pending",
    email: invite.email,
    role: invite.role,
    expires_at: invite.expires_at,
    tenant_name: tenantRes.data?.name ?? "FaturaAI",
    tenant_logo_url: tenantRes.data?.logo_url ?? null,
    tenant_primary_color: tenantRes.data?.primary_color ?? "#0E2435",
    inviter_email: (inviterRes.data as { email?: string } | null)?.email ?? null,
  }, corsHeaders);
});
