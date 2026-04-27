// ============================================
// Edge Function: invite-member
// Cria convite para um novo membro do tenant. Owner-only.
// Valida plano (has_multi_user) e limite de seats (max_users).
// Envia email HTML via Resend (best-effort) — owner também recebe link
// copiável na UI como fallback.
//
// Body: { tenant_id: string, email: string, role: 'member' | 'readonly' }
// Resp 200: { invite_id, token, expires_at, invite_url, email_sent }
// Resp 402: limite de seats atingido ou plano sem multi-user
// Resp 409: email já é membro ou tem convite pendente
// ============================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders, getFrontendUrl } from "../_shared/cors.ts";
import { logEdgeError } from "../_shared/logError.ts";
import { sendEmail } from "../_shared/resend.ts";
import { renderInviteEmail } from "./emailTemplate.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const EMAIL_FROM = Deno.env.get("INVITE_EMAIL_FROM") ?? "FaturaAI <noreply@mail.flowzi.pt>";

const VALID_ROLES = new Set(["member", "readonly"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOKEN_BYTES = 32;

function json(status: number, body: unknown, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

function generateToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" }, corsHeaders);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json(401, { error: "Unauthorized" }, corsHeaders);

  let body: { tenant_id?: string; email?: string; role?: string };
  try { body = await req.json(); } catch { return json(400, { error: "Invalid JSON" }, corsHeaders); }

  const tenantId = body.tenant_id?.trim();
  const email = body.email?.trim().toLowerCase();
  const role = body.role?.trim() as "member" | "readonly" | undefined;

  if (!tenantId || !email || !role) {
    return json(400, { error: "Faltam tenant_id, email ou role" }, corsHeaders);
  }
  if (!EMAIL_RE.test(email)) return json(400, { error: "Email inválido" }, corsHeaders);
  if (!VALID_ROLES.has(role)) return json(400, { error: "Role tem de ser 'member' ou 'readonly'" }, corsHeaders);

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json(401, { error: "Unauthorized" }, corsHeaders);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  // 1) Owner check
  const { data: ownerRow } = await admin.from("tenant_users")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("user_id", user.id)
    .eq("role", "owner")
    .eq("is_active", true)
    .maybeSingle();
  if (!ownerRow) return json(403, { error: "Apenas o owner do tenant pode convidar membros." }, corsHeaders);

  // 2) Tenant + plan
  const { data: tenantRow } = await admin.from("tenants")
    .select("name, logo_url, primary_color, plan_id, plans(slug, has_multi_user, max_users)")
    .eq("id", tenantId)
    .maybeSingle();
  type PlanInfo = { slug: string; has_multi_user: boolean; max_users: number | null };
  type TenantRow = {
    name: string; logo_url: string | null; primary_color: string;
    plan_id: string | null; plans: PlanInfo | PlanInfo[] | null;
  };
  const tRow = tenantRow as TenantRow | null;
  const planRel = tRow?.plans;
  const plan = (Array.isArray(planRel) ? planRel[0] : planRel) ?? null;
  if (!plan?.has_multi_user) {
    return json(402, { error: "Faz upgrade do plano para convidar membros." }, corsHeaders);
  }

  if (plan.max_users !== null) {
    const { data: seatsResult } = await admin.rpc("count_tenant_seats", { p_tenant_id: tenantId });
    const used = typeof seatsResult === "number" ? seatsResult : Number(seatsResult ?? 0);
    if (used >= plan.max_users) {
      return json(402, {
        error: `Limite de utilizadores atingido (${used}/${plan.max_users}). Faz upgrade ou remove membros pendentes.`,
        seats_used: used,
        seats_max: plan.max_users,
      }, corsHeaders);
    }
  }

  // 3) Duplicate checks
  const { data: existingUser } = await admin
    .schema("auth").from("users")
    .select("id")
    .ilike("email", email)
    .maybeSingle();
  if (existingUser) {
    const { data: existingMember } = await admin.from("tenant_users")
      .select("id, is_active")
      .eq("tenant_id", tenantId)
      .eq("user_id", existingUser.id)
      .maybeSingle();
    if (existingMember?.is_active) {
      return json(409, { error: "Esse utilizador já é membro deste tenant." }, corsHeaders);
    }
  }

  const { data: existingInvite } = await admin.from("tenant_invites")
    .select("id, expires_at")
    .eq("tenant_id", tenantId)
    .ilike("email", email)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .maybeSingle();
  if (existingInvite && new Date(existingInvite.expires_at as string) > new Date()) {
    return json(409, { error: "Já existe convite pendente para esse email." }, corsHeaders);
  }

  // 4) Generate token + INSERT
  const token = generateToken();
  const tokenHash = await sha256Hex(token);

  const { data: inviteRow, error: insertErr } = await admin.from("tenant_invites")
    .insert({
      tenant_id: tenantId,
      email,
      role,
      token,
      token_hash: tokenHash,
      invited_by: user.id,
    })
    .select("id, expires_at")
    .single();

  if (insertErr || !inviteRow) {
    await logEdgeError({
      functionName: "invite-member",
      level: "error",
      message: insertErr?.message ?? "insert failed",
      tenantId,
      userId: user.id,
    });
    return json(500, { error: insertErr?.message ?? "Falha a criar convite" }, corsHeaders);
  }

  const inviteUrl = `${getFrontendUrl()}/invite/${token}`;

  // 5) Resend email (best-effort) — falha silenciosa não bloqueia o link
  let emailSent = false;
  if (Deno.env.get("RESEND_API_KEY")) {
    const tpl = renderInviteEmail({
      tenantName: tRow?.name ?? "FaturaAI",
      tenantLogoUrl: tRow?.logo_url ?? null,
      primaryColor: tRow?.primary_color ?? "#0E2435",
      inviterEmail: user.email ?? "owner@faturaai.pt",
      role,
      inviteUrl,
      expiresAt: inviteRow.expires_at as string,
    });
    const result = await sendEmail({
      from: EMAIL_FROM,
      to: email,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      replyTo: user.email ?? undefined,
      tags: [
        { name: "type", value: "tenant_invite" },
        { name: "tenant_id", value: tenantId },
      ],
    });
    if (result.ok) {
      emailSent = true;
    } else {
      await logEdgeError({
        functionName: "invite-member",
        level: "warn",
        message: `resend failed: ${result.error}`,
        httpStatus: result.status ?? null,
        tenantId,
        userId: user.id,
        metadata: { invite_email: email },
      });
    }
  }

  return json(200, {
    invite_id: inviteRow.id,
    token,
    expires_at: inviteRow.expires_at,
    invite_url: inviteUrl,
    email,
    role,
    email_sent: emailSent,
  }, corsHeaders);
});
