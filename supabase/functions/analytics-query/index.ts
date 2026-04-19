// ============================================
// Edge Function: analytics-query
// Proxy admin para PostHog Query API (HogQL).
// Secrets: POSTHOG_PERSONAL_API_KEY, POSTHOG_PROJECT_ID,
//          POSTHOG_HOST (opcional, default eu.posthog.com),
//          SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
// Deploy: supabase functions deploy analytics-query
// ============================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { buildHogQL, VALID_QUERY_IDS, type QueryId } from "./queries.ts";

const POSTHOG_HOST = Deno.env.get("POSTHOG_HOST") ?? "https://eu.posthog.com";
const POSTHOG_PROJECT_ID = Deno.env.get("POSTHOG_PROJECT_ID");
const POSTHOG_PERSONAL_API_KEY = Deno.env.get("POSTHOG_PERSONAL_API_KEY");

interface CacheEntry { expiresAt: number; data: unknown; }
const CACHE = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60_000;

function json(status: number, body: unknown, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function cacheKey(id: string, params: Record<string, unknown>): string {
  return `${id}:${JSON.stringify(params)}`;
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" }, cors);

  try {
    if (!POSTHOG_PROJECT_ID || !POSTHOG_PERSONAL_API_KEY) {
      return json(500, { error: "PostHog nao configurado (secrets em falta)" }, cors);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { error: "Unauthorized" }, cors);

    const userClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json(401, { error: "Unauthorized" }, cors);

    const adminClient = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data: isAdmin, error: adminErr } = await adminClient.rpc("is_admin_global", { uid: user.id });
    if (adminErr) return json(500, { error: `Admin check falhou: ${adminErr.message}` }, cors);
    if (!isAdmin) return json(403, { error: "Forbidden" }, cors);

    const body = await req.json().catch(() => ({}));
    const queryId = body?.query_id as string | undefined;
    const params = (body?.params ?? {}) as Record<string, unknown>;

    if (!queryId || !VALID_QUERY_IDS.includes(queryId as QueryId)) {
      return json(400, { error: "query_id invalido", valid: VALID_QUERY_IDS }, cors);
    }

    const key = cacheKey(queryId, params);
    const cached = CACHE.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return json(200, { ...cached.data as object, cached: true }, cors);
    }

    let hogql: string;
    try {
      hogql = buildHogQL(queryId as QueryId, params);
    } catch (e) {
      return json(400, { error: e instanceof Error ? e.message : "Query build falhou" }, cors);
    }

    const phResp = await fetch(`${POSTHOG_HOST}/api/projects/${POSTHOG_PROJECT_ID}/query/`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${POSTHOG_PERSONAL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: { kind: "HogQLQuery", query: hogql },
      }),
    });

    if (!phResp.ok) {
      const text = await phResp.text().catch(() => "");
      return json(502, {
        error: `PostHog devolveu ${phResp.status}`,
        detail: text.slice(0, 500),
      }, cors);
    }

    const phBody = await phResp.json();
    const result = {
      query_id: queryId,
      columns: phBody.columns ?? [],
      results: phBody.results ?? [],
      types: phBody.types ?? null,
    };

    CACHE.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, data: result });
    if (CACHE.size > 200) {
      const oldest = [...CACHE.keys()][0];
      CACHE.delete(oldest);
    }

    return json(200, { ...result, cached: false }, cors);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return json(500, { error: msg }, cors);
  }
});
