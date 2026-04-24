// ============================================
// Edge Function: revoke-oauth-token
// ============================================
// Revoga token OAuth no Google + apaga a row do BD.
// O cliente chama esta função em vez de apagar directamente o row,
// para garantir revocação server-side e não deixar tokens órfãos.
// Deploy: supabase functions deploy revoke-oauth-token --project-ref <ref>

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { logEdgeError } from "../_shared/logError.ts";

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

    const { token_id } = await req.json();
    if (!token_id || typeof token_id !== "string") {
      return json(400, { error: "token_id obrigatório" }, corsHeaders);
    }

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // Validar ownership
    const { data: token } = await admin
      .from("user_oauth_tokens")
      .select("id, refresh_token, access_token")
      .eq("id", token_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!token) return json(404, { error: "Token não encontrado" }, corsHeaders);

    // Best-effort revoke no Google — se falhar, continua para apagar localmente
    const tokenToRevoke = token.refresh_token || token.access_token;
    if (tokenToRevoke) {
      try {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(tokenToRevoke)}`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        });
      } catch (e) {
        console.warn("[revoke-oauth-token] google revoke failed", e);
      }
    }

    // Desactivar email_accounts dependentes (soft) e apagar o token
    await admin.from("email_accounts").update({ is_active: false, oauth_token_id: null }).eq("oauth_token_id", token_id);
    const { error: delErr } = await admin.from("user_oauth_tokens").delete().eq("id", token_id);
    if (delErr) return json(500, { error: "Falha ao apagar token" }, corsHeaders);

    return json(200, { revoked: true }, corsHeaders);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erro interno";
    await logEdgeError({
      functionName: "revoke-oauth-token",
      message: msg,
      error,
      httpMethod: req.method,
      httpPath: new URL(req.url).pathname,
      httpStatus: 500,
    });
    return json(500, { error: msg }, corsHeaders);
  }
});
