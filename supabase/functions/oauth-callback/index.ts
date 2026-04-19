import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getAllowedOrigins, getCorsHeaders, getFrontendUrl } from "../_shared/cors.ts";
import { verifyState } from "../_shared/oauthState.ts";
import { logEdgeError } from "../_shared/logError.ts";

const LOCALHOST_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const SAFE_SOURCES: Record<string, string> = {
  onboarding: "/onboarding",
  upload: "/upload",
  settings: "/settings",
};

// Escolhe uma origem segura para redirect ao frontend — nunca localhost
// exceto se explicitamente listado em ALLOWED_ORIGINS.
function safeFrontendOrigin(stateOrigin?: string | null): string {
  const allowed = getAllowedOrigins();
  const nonLocal = allowed.find((o) => !LOCALHOST_RE.test(o));
  if (stateOrigin) {
    if (allowed.includes(stateOrigin)) return stateOrigin;
  }
  const envUrl = Deno.env.get("FRONTEND_URL");
  if (envUrl && !LOCALHOST_RE.test(envUrl)) return envUrl;
  return nonLocal ?? getFrontendUrl();
}

function redirectWithError(frontendUrl: string, redirectPath: string, message: string): Response {
  const errorUrl = new URL(`${frontendUrl}${redirectPath}`);
  errorUrl.searchParams.set("oauth", "error");
  errorUrl.searchParams.set("message", message);
  return new Response(null, { status: 302, headers: { Location: errorUrl.toString() } });
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const stateParam = url.searchParams.get("state");
    const googleError = url.searchParams.get("error");

    const claims = stateParam ? await verifyState(stateParam) : null;

    // Fallback source/origin se state é inválido (legacy plain-JSON vindo de bundle
    // frontend antigo). Tentamos ler o "source" do JSON para redirect_path,
    // mas NUNCA confiamos no origin para redirect (pode ser localhost forjado).
    let legacySource: string | null = null;
    if (!claims && stateParam) {
      try {
        const parsed = JSON.parse(decodeURIComponent(stateParam));
        if (typeof parsed?.source === "string") legacySource = parsed.source;
        console.warn("[oauth-callback] state sem HMAC (frontend desactualizado?)", { source: legacySource });
      } catch {
        console.warn("[oauth-callback] state parse falhou");
      }
    }

    const redirectPath = SAFE_SOURCES[(claims?.source ?? legacySource) ?? "settings"] ?? "/settings";
    const frontendUrl = safeFrontendOrigin(claims?.origin);

    if (!claims) {
      return redirectWithError(frontendUrl, redirectPath, "Refaz login e tenta ligar Google novamente.");
    }

    const { user_id: userId, company_id: companyId } = claims;

    const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
    const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!clientId || !clientSecret || !supabaseUrl || !supabaseServiceKey) {
      return redirectWithError(frontendUrl, redirectPath, "Configuração do servidor em falta");
    }
    if (googleError) {
      return redirectWithError(frontendUrl, redirectPath, "Autorização Google negada");
    }
    if (!code) {
      return redirectWithError(frontendUrl, redirectPath, "Código de autorização em falta");
    }

    const redirectUri = `${supabaseUrl}/functions/v1/oauth-callback`;

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
      return redirectWithError(frontendUrl, redirectPath, "Falha ao obter tokens Google");
    }
    const tokens = await tokenResponse.json();
    if (!tokens.access_token) {
      return redirectWithError(frontendUrl, redirectPath, "Access token não recebido");
    }

    const grantedScopes: string[] = tokens.scope ? tokens.scope.split(" ") : [];

    const userInfoResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!userInfoResponse.ok) {
      return redirectWithError(frontendUrl, redirectPath, "Falha ao obter info Google");
    }
    const userInfo = await userInfoResponse.json();
    if (!userInfo.email) {
      return redirectWithError(frontendUrl, redirectPath, "Email Google indisponível");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });

    const expiresIn = tokens.expires_in || 3600;
    const tokenExpiry = new Date(Date.now() + expiresIn * 1000).toISOString();

    const { data: tenantUser } = await supabase
      .from("tenant_users")
      .select("tenant_id")
      .eq("user_id", userId)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    if (!tenantUser?.tenant_id) {
      return redirectWithError(frontendUrl, redirectPath, "Tenant não encontrado");
    }
    const tenantId = tenantUser.tenant_id;

    if (companyId) {
      const { data: company } = await supabase
        .from("companies")
        .select("id")
        .eq("id", companyId)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (!company) {
        return redirectWithError(frontendUrl, redirectPath, "Empresa inacessível");
      }
    }

    const scopes = grantedScopes.length > 0 ? grantedScopes : [
      "email", "profile",
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/drive.file",
      "https://www.googleapis.com/auth/spreadsheets",
    ];

    const { data: existing } = await supabase
      .from("user_oauth_tokens")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("email", userInfo.email)
      .eq("provider", "google")
      .maybeSingle();

    let tokenRowId: string | null = existing?.id ?? null;

    if (existing) {
      const { error: updateError } = await supabase
        .from("user_oauth_tokens")
        .update({
          user_id: userId,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token || undefined,
          token_expiry: tokenExpiry,
          scopes,
        })
        .eq("id", existing.id);
      if (updateError) {
        await logEdgeError({
          functionName: "oauth-callback",
          message: `update user_oauth_tokens falhou: ${updateError.message}`,
          error: updateError,
          tenantId,
          userId,
          metadata: { phase: "update", code: updateError.code },
        });
        return redirectWithError(frontendUrl, redirectPath, "Falha ao gravar tokens");
      }
    } else {
      const { count } = await supabase
        .from("user_oauth_tokens")
        .select("*", { count: "exact", head: true })
        .eq("provider", "google")
        .eq("tenant_id", tenantId);
      const isPrimary = (count || 0) === 0;

      const { data: inserted, error: insertError } = await supabase
        .from("user_oauth_tokens")
        .insert({
          tenant_id: tenantId,
          user_id: userId,
          provider: "google",
          email: userInfo.email,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token || "",
          token_expiry: tokenExpiry,
          scopes,
          is_primary_storage: isPrimary,
        })
        .select("id")
        .single();
      if (insertError || !inserted) {
        await logEdgeError({
          functionName: "oauth-callback",
          message: `insert user_oauth_tokens falhou: ${insertError?.message ?? "sem detalhe"}`,
          error: insertError,
          tenantId,
          userId,
          metadata: { phase: "insert", code: insertError?.code },
        });
        return redirectWithError(frontendUrl, redirectPath, "Falha ao gravar tokens");
      }
      tokenRowId = inserted.id;
    }

    if (companyId && tokenRowId) {
      await supabase
        .from("companies")
        .update({ email: userInfo.email, oauth_token_id: tokenRowId })
        .eq("id", companyId)
        .eq("tenant_id", tenantId);

      const { data: existingEA } = await supabase
        .from("email_accounts")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("email", userInfo.email)
        .maybeSingle();
      if (existingEA) {
        await supabase.from("email_accounts").update({
          company_id: companyId, oauth_token_id: tokenRowId, is_active: true,
        }).eq("id", existingEA.id);
      } else {
        await supabase.from("email_accounts").insert({
          tenant_id: tenantId,
          user_id: userId,
          email: userInfo.email,
          provider: "gmail",
          company_id: companyId,
          oauth_token_id: tokenRowId,
          is_active: true,
        });
      }
    }

    const successUrl = new URL(`${frontendUrl}${redirectPath}`);
    successUrl.searchParams.set("oauth", "success");
    return new Response(null, {
      status: 302,
      headers: { Location: successUrl.toString() },
    });
  } catch (error) {
    await logEdgeError({
      functionName: "oauth-callback",
      message: error instanceof Error ? error.message : "unexpected error",
      error,
      level: "fatal",
    });
    return redirectWithError(safeFrontendOrigin(), "/settings", "Erro interno");
  }
});
