// ============================================
// Edge Function: refresh-token
// ============================================
// Renova tokens Google expirados.
// Deploy: supabase functions deploy refresh-token --project-ref <ref>
// Env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SUPABASE_URL,
//           SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://faturai-lgm.vercel.app",
  "http://localhost:5173",
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email } = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ error: "Email é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const oauthTable = "user_oauth_tokens";

    const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
    const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!clientId || !clientSecret) {
      return new Response(
        JSON.stringify({ error: "Configuração OAuth em falta" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl!, supabaseServiceKey!, {
      auth: { persistSession: false },
    });

    // Auth check: verify caller owns the token
    const authHeader = req.headers.get("Authorization");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    if (authHeader && anonKey) {
      const userClient = createClient(supabaseUrl!, anonKey, {
        auth: { persistSession: false },
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) {
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const { data: tokenCheck } = await supabase
        .from(oauthTable)
        .select("id")
        .eq("email", email)
        .eq("user_id", user.id)
        .single();
      if (!tokenCheck) {
        return new Response(
          JSON.stringify({ error: "Acesso negado" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Buscar token atual
    const { data: account, error: fetchError } = await supabase
      .from(oauthTable)
      .select("id, refresh_token, token_expiry")
      .eq("email", email)
      .eq("provider", "google")
      .single();

    if (fetchError || !account) {
      return new Response(
        JSON.stringify({ error: "Conta não encontrada" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!account.refresh_token) {
      return new Response(
        JSON.stringify({ error: "Refresh token não disponível. Re-autentique a conta." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verificar se token ainda e valido (buffer de 5 min)
    const tokenExpiry = new Date(account.token_expiry);
    const now = new Date();
    const bufferMs = 5 * 60 * 1000;

    if (tokenExpiry.getTime() - bufferMs > now.getTime()) {
      return new Response(
        JSON.stringify({
          refreshed: false,
          message: "Token ainda válido",
          expires_at: account.token_expiry
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Renovar token
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
      } catch { /* Keep raw error */ }

      if (tokenResponse.status === 400 || tokenResponse.status === 401) {
        return new Response(
          JSON.stringify({ error: `Refresh token inválido: ${googleError}`, needs_reauth: true }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: `Falha ao renovar token: ${googleError}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tokens = await tokenResponse.json();

    const expiresIn = tokens.expires_in || 3600;
    const newExpiry = new Date(Date.now() + expiresIn * 1000).toISOString();

    // Guardar novo token
    const { error: updateError } = await supabase
      .from(oauthTable)
      .update({
        access_token: tokens.access_token,
        token_expiry: newExpiry,
        ...(tokens.refresh_token && { refresh_token: tokens.refresh_token }),
      })
      .eq("id", account.id);

    if (updateError) {
      return new Response(
        JSON.stringify({ error: "Falha ao guardar novo token" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        refreshed: true,
        message: "Token renovado com sucesso",
        expires_at: newExpiry
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    const corsHeaders = getCorsHeaders(req);
    return new Response(
      JSON.stringify({ error: "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
