// ============================================
// Edge Function: admin-create-user
// ============================================
// Cria uma conta nova (auth.users) e adiciona à tabela admin_users.
// Requer que o caller seja admin global.
// Deploy: supabase functions deploy admin-create-user --project-ref <ref>

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

interface Body {
  email?: unknown;
  password?: unknown;
  note?: unknown;
  send_invite?: unknown;
}

function json(status: number, body: unknown, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function validEmail(email: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) && email.length <= 200;
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" }, corsHeaders);

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

  const { data: isAdmin, error: isAdminErr } = await admin.rpc("is_admin_global", { uid: user.id });
  if (isAdminErr || isAdmin !== true) {
    return json(403, { error: "Forbidden" }, corsHeaders);
  }

  const body = (await req.json()) as Body;
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 200) : null;
  const sendInvite = body.send_invite === true;

  if (!validEmail(email)) return json(400, { error: "invalid_email" }, corsHeaders);
  if (!sendInvite && password.length < 8) {
    return json(400, { error: "password_too_short" }, corsHeaders);
  }

  let targetUserId: string | null = null;

  const { data: existing } = await admin.rpc("list_admins");
  if (Array.isArray(existing) && existing.some((a: { email?: string }) => a.email?.toLowerCase() === email)) {
    return json(409, { error: "already_admin" }, corsHeaders);
  }

  if (sendInvite) {
    const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email);
    if (inviteErr) {
      const msg = inviteErr.message ?? "";
      if (msg.toLowerCase().includes("already")) {
        const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
        const found = list.users.find((u) => u.email?.toLowerCase() === email);
        if (!found) return json(500, { error: "invite_failed", detail: msg }, corsHeaders);
        targetUserId = found.id;
      } else {
        return json(500, { error: "invite_failed", detail: msg }, corsHeaders);
      }
    } else {
      targetUserId = invited.user?.id ?? null;
    }
  } else {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createErr) {
      const msg = createErr.message ?? "";
      if (msg.toLowerCase().includes("already")) {
        return json(409, { error: "user_already_exists" }, corsHeaders);
      }
      return json(500, { error: "create_failed", detail: msg }, corsHeaders);
    }
    targetUserId = created.user?.id ?? null;
  }

  if (!targetUserId) return json(500, { error: "no_user_id" }, corsHeaders);

  const { error: insertErr } = await admin
    .from("admin_users")
    .upsert({ user_id: targetUserId, note }, { onConflict: "user_id" });

  if (insertErr) {
    return json(500, { error: "admin_insert_failed", detail: insertErr.message }, corsHeaders);
  }

  return json(200, { ok: true, user_id: targetUserId, invited: sendInvite }, corsHeaders);
});
