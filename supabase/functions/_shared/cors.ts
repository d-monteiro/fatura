// CORS helper partilhado. Origens permitidas vêm da env `ALLOWED_ORIGINS`
// (lista separada por vírgulas). Fallback para dev + prod conhecidos.

const FALLBACK_ORIGINS = [
  "https://faturas.flowzi.pt",
  "http://localhost:5173",
];

export function getAllowedOrigins(): string[] {
  const fromEnv = Deno.env.get("ALLOWED_ORIGINS");
  if (!fromEnv) return FALLBACK_ORIGINS;
  return fromEnv.split(",").map((s) => s.trim()).filter(Boolean);
}

export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  const allowed = getAllowedOrigins();
  const match = allowed.includes(origin) ? origin : allowed[0];
  return {
    "Access-Control-Allow-Origin": match,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

export function getFrontendUrl(): string {
  return Deno.env.get("FRONTEND_URL") || getAllowedOrigins()[0];
}
