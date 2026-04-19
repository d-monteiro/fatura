// ============================================
// Edge Function: refresh-token
// ============================================
// Renova tokens Google expirados. Não devolve access_token ao cliente —
// a renovação persiste em BD e o cliente apenas sabe se foi bem-sucedida.
// Deploy: supabase functions deploy refresh-token --project-ref <ref>
// Env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SUPABASE_URL,
//           SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY

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

  try {
    const { email } = await req.json();
    if (!email || typeof email !== "string") {
      return json(400, { error: "Email é obrigatório" }, corsHeaders);
    }

    const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
    const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    if (!clientId || !clientSecret || !supabaseUrl || !supabaseServiceKey || !anonKey) {
      return json(500, { error: "Configuração em falta" }, corsHeaders);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { error: "Unauthorized" }, corsHeaders);

    const userClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json(401, { error: "Unauthorized" }, corsHeaders);

    const supabase = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });

    // Scope por user_id + email: garante que só renova tokens do caller
    const { data: account, error: fetchError } = await supabase
      .from("user_oauth_tokens")
      .select("id, refresh_token, token_expiry")
      .eq("user_id", user.id)
      .eq("email", email)
      .eq("provider", "google")
      .maybeSingle();

    if (fetchError || !account) {
      return json(404, { error: "Conta não encontrada" }, corsHeaders);
    }

    if (!account.refresh_token) {
      return json(400, { error: "Refresh token indisponível. Re-autentique a conta.", needs_reauth: true }, corsHeaders);
    }

    const tokenExpiry = account.token_expiry ? new Date(account.token_expiry) : null;
    const bufferMs = 5 * 60 * 1000;
    if (tokenExpiry && tokenExpiry.getTime() - bufferMs > Date.now()) {
      return json(200, { refreshed: false, expires_at: account.token_expiry }, corsHeaders);
    }

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: account.refresh_token,
        grant_type: "refresh_token",
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      let googleError = errorData;
      try {
        const parsed = JSON.parse(errorData);
        googleError = parsed.error_description || parsed.error || errorData;
      } catch { /* keep raw */ }

      if (tokenResponse.status === 400 || tokenResponse.status === 401) {
        return json(401, { error: "Refresh token inválido", needs_reauth: true, detail: googleError.slice(0, 120) }, corsHeaders);
      }
      return json(502, { error: "Falha ao renovar token" }, corsHeaders);
    }

    const tokens = await tokenResponse.json();
    const expiresIn = tokens.expires_in || 3600;
    const newExpiry = new Date(Date.now() + expiresIn * 1000).toISOString();

    const { error: updateError } = await supabase
      .from("user_oauth_tokens")
      .update({
        access_token: tokens.access_token,
        token_expiry: newExpiry,
        ...(tokens.refresh_token && { refresh_token: tokens.refresh_token }),
      })
      .eq("id", account.id);
    if (updateError) {
      await logEdgeError({
        functionName: "refresh-token",
        message: `Falha ao guardar novo token: ${updateError.message}`,
        error: updateError,
        metadata: { code: updateError.code, accountId: account.id },
      });
      return json(500, { error: "Falha ao guardar novo token" }, corsHeaders);
    }

    return json(200, { refreshed: true, expires_at: newExpiry }, corsHeaders);
  } catch (error) {
    await logEdgeError({
      functionName: "refresh-token",
      message: error instanceof Error ? error.message : "Erro interno",
      error,
      httpStatus: 500,
    });
    return json(500, { error: "Erro interno" }, corsHeaders);
  }
});
