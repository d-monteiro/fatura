// ============================================
// Edge Function: oauth-callback
// ============================================
// Recebe o callback do Google OAuth e guarda tokens no Supabase.
// Deploy: supabase functions deploy oauth-callback --project-ref <ref>
// Env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SUPABASE_URL,
//           SUPABASE_SERVICE_ROLE_KEY, FRONTEND_URL

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
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const stateParam = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    // Parse state para obter user_id e company_id
    let userId: string | null = null;
    let companyId: string | null = null;
    try {
      if (stateParam) {
        const stateData = JSON.parse(stateParam);
        if (stateData.user_id) userId = stateData.user_id;
        if (stateData.company_id) companyId = stateData.company_id;
      }
    } catch {
      // Invalid state JSON
    }

    const oauthTable = "user_oauth_tokens";
    const redirectPath = companyId ? "/settings" : "/automations";

    const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
    const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const frontendUrl = Deno.env.get("FRONTEND_URL") || ALLOWED_ORIGINS[0];

    if (!clientId || !clientSecret) {
      return redirectWithError(frontendUrl, redirectPath, "Configuração OAuth em falta");
    }

    if (error) {
      return redirectWithError(frontendUrl, redirectPath, `Erro OAuth: ${error}`);
    }

    if (!code) {
      return redirectWithError(frontendUrl, redirectPath, "Código de autorização em falta");
    }

    if (!userId) {
      return redirectWithError(frontendUrl, redirectPath, "Sessão inválida. Faça login novamente.");
    }

    const redirectUri = `${supabaseUrl}/functions/v1/oauth-callback`;

    // Trocar code por tokens
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      return redirectWithError(frontendUrl, redirectPath, "Falha ao obter tokens");
    }

    const tokens = await tokenResponse.json();

    if (!tokens.access_token) {
      return redirectWithError(frontendUrl, redirectPath, "Access token não recebido");
    }

    const grantedScopes = tokens.scope ? tokens.scope.split(" ") : [];

    // Obter info do utilizador Google
    const userInfoResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userInfoResponse.ok) {
      return redirectWithError(frontendUrl, redirectPath, "Falha ao obter info do utilizador");
    }

    const userInfo = await userInfoResponse.json();

    if (!userInfo.email) {
      return redirectWithError(frontendUrl, redirectPath, "Email não disponível");
    }

    // Guardar tokens no Supabase
    const supabase = createClient(supabaseUrl!, supabaseServiceKey!, {
      auth: { persistSession: false },
    });

    const expiresIn = tokens.expires_in || 3600;
    const tokenExpiry = new Date(Date.now() + expiresIn * 1000).toISOString();

    const { data: existing } = await supabase
      .from(oauthTable)
      .select("id")
      .eq("email", userInfo.email)
      .eq("provider", "google")
      .single();

    const scopes = grantedScopes.length > 0 ? grantedScopes : [
      "email",
      "profile",
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.modify",
      "https://www.googleapis.com/auth/drive.file",
    ];

    if (existing) {
      const { error: updateError } = await supabase
        .from(oauthTable)
        .update({
          user_id: userId,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token || undefined,
          token_expiry: tokenExpiry,
          scopes,
        })
        .eq("id", existing.id);

      if (updateError) {
        return redirectWithError(frontendUrl, redirectPath, "Erro ao atualizar conta");
      }
    } else {
      const { count } = await supabase
        .from(oauthTable)
        .select("*", { count: "exact", head: true })
        .eq("provider", "google")
        .eq("user_id", userId);

      const isPrimary = (count || 0) === 0;

      const { error: insertError } = await supabase.from(oauthTable).insert({
        user_id: userId,
        provider: "google",
        email: userInfo.email,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || "",
        token_expiry: tokenExpiry,
        scopes,
        is_primary_storage: isPrimary,
      });

      if (insertError) {
        return redirectWithError(frontendUrl, redirectPath, "Erro ao guardar conta");
      }
    }

    // Link email to company if company_id provided
    if (companyId) {
      // Get the token ID we just saved
      const { data: savedToken } = await supabase
        .from(oauthTable)
        .select("id")
        .eq("email", userInfo.email)
        .eq("provider", "google")
        .single();

      if (savedToken) {
        await supabase
          .from("companies")
          .update({ email: userInfo.email, oauth_token_id: savedToken.id })
          .eq("id", companyId);
      }

      // Also upsert email_accounts for backward compat (sync-email last_sync_at)
      const { data: existingEA } = await supabase
        .from("email_accounts")
        .select("id")
        .eq("email", userInfo.email)
        .single();

      if (existingEA) {
        await supabase.from("email_accounts").update({
          company_id: companyId, oauth_token_id: savedToken?.id, is_active: true,
        }).eq("id", existingEA.id);
      } else {
        await supabase.from("email_accounts").insert({
          user_id: userId, email: userInfo.email, provider: "gmail",
          company_id: companyId, oauth_token_id: savedToken?.id, is_active: true,
        });
      }
    }

    // Redirect com sucesso
    const successUrl = new URL(`${frontendUrl}${redirectPath}`);
    successUrl.searchParams.set("oauth", "success");
    successUrl.searchParams.set("email", userInfo.email);
    if (companyId) successUrl.searchParams.set("company_id", companyId);

    return new Response(null, {
      status: 302,
      headers: {
        Location: successUrl.toString(),
        ...corsHeaders,
      },
    });
  } catch (error) {
    const frontendUrl = Deno.env.get("FRONTEND_URL") || ALLOWED_ORIGINS[0];
    return redirectWithError(frontendUrl, "/automations", "Erro interno");
  }
});

function redirectWithError(frontendUrl: string, redirectPath: string, message: string): Response {
  const errorUrl = new URL(`${frontendUrl}${redirectPath}`);
  errorUrl.searchParams.set("oauth", "error");
  errorUrl.searchParams.set("message", message);

  return new Response(null, {
    status: 302,
    headers: {
      Location: errorUrl.toString(),
    },
  });
}
