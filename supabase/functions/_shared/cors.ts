// CORS helper partilhado. Origens permitidas vêm da env `ALLOWED_ORIGINS`
// (lista separada por vírgulas). Fallback para dev + prod conhecidos.

const FALLBACK_ORIGINS = [
  "https://fatura.flowzi.pt",
  "http://localhost:5173",
];

export function getAllowedOrigins(): string[] {
  const fromEnv = Deno.env.get("ALLOWED_ORIGINS");
  if (!fromEnv) return FALLBACK_ORIGINS;
  return fromEnv.split(",").map((s) => s.trim()).filter(Boolean);
}

const LOCALHOST_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

function isOriginAllowed(origin: string): boolean {
  if (!origin) return false;
  const allowed = getAllowedOrigins();
  if (allowed.includes(origin)) return true;
  if (LOCALHOST_RE.test(origin) && Deno.env.get("DENO_DEPLOYMENT_ID") === undefined) {
    // Localhost only in dev (no DENO_DEPLOYMENT_ID set locally)
    return true;
  }
  if (LOCALHOST_RE.test(origin) && allowed.some((o) => LOCALHOST_RE.test(o))) {
    // Localhost in env whitelist
    return true;
  }
  return false;
}

export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  const headers: Record<string, string> = {
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret, x-internal-secret",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "600",
  };
  if (isOriginAllowed(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

export function getFrontendUrl(): string {
  const raw = Deno.env.get("FRONTEND_URL") || getAllowedOrigins()[0];
  return raw.replace(/\/+$/, "");
}
