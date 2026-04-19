// ============================================
// Edge Function: oauth-start
// ============================================
// Devolve auth_url com state HMAC-assinado. O user_id é extraído do JWT,
// nunca confiado do body. Previne CSRF/account takeover no oauth-callback.
// Deploy: supabase functions deploy oauth-start --project-ref <ref>

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders, getAllowedOrigins } from "../_shared/cors.ts";
import { signState } from "../_shared/oauthState.ts";
import { logEdgeError } from "../_shared/logError.ts";

const FULL_SCOPES = [
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/spreadsheets",
];

const ALLOWED_SOURCES = new Set(["onboarding", "upload", "settings"]);

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
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
    if (!clientId) return json(500, { error: "Config OAuth em falta" }, corsHeaders);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { error: "Unauthorized" }, corsHeaders);

    const userClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json(401, { error: "Unauthorized" }, corsHeaders);

    const { source, company_id, origin, prompt_select, login_hint } = await req.json();

    if (!source || !ALLOWED_SOURCES.has(source)) {
      return json(400, { error: "source inválido" }, corsHeaders);
    }
    if (!origin || typeof origin !== "string") {
      return json(400, { error: "origin obrigatório" }, corsHeaders);
    }
    const allowed = getAllowedOrigins();
    const localhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    if (!allowed.includes(origin) && !localhost) {
      return json(400, { error: "origin não autorizado" }, corsHeaders);
    }

    let validatedCompanyId: string | null = null;
    if (company_id) {
      if (typeof company_id !== "string") {
        return json(400, { error: "company_id inválido" }, corsHeaders);
      }
      const { data: membership } = await userClient
        .from("companies")
        .select("id")
        .eq("id", company_id)
        .maybeSingle();
      if (!membership) {
        return json(403, { error: "company inacessível" }, corsHeaders);
      }
      validatedCompanyId = company_id;
    }

    const state = await signState({
      user_id: user.id,
      company_id: validatedCompanyId,
      source,
      origin,
    });

    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", `${supabaseUrl}/functions/v1/oauth-callback`);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", FULL_SCOPES.join(" "));
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", prompt_select ? "select_account consent" : "consent");
    authUrl.searchParams.set("state", state);
    if (typeof login_hint === "string" && login_hint) authUrl.searchParams.set("login_hint", login_hint);

    return json(200, { auth_url: authUrl.toString() }, corsHeaders);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erro interno";
    await logEdgeError({
      functionName: "oauth-start",
      message: msg,
      error,
      httpStatus: 500,
    });
    return json(500, { error: msg }, corsHeaders);
  }
});
