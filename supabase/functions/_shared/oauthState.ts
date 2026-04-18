// HMAC-signed OAuth state helpers.
// Previne forja de user_id/company_id no fluxo OAuth.

const TTL_MS = 10 * 60 * 1000;

function getSecret(): string {
  const s = Deno.env.get("OAUTH_STATE_SECRET") || Deno.env.get("SUPABASE_JWT_SECRET") || "";
  if (!s) throw new Error("OAUTH_STATE_SECRET/SUPABASE_JWT_SECRET em falta");
  return s;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function b64urlEncode(s: string): string {
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): string {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/") + "==".slice((s.length + 3) % 4);
  return atob(padded);
}

async function hmacSha256(key: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(data));
  return bytesToHex(new Uint8Array(sig));
}

export interface OAuthStateClaims {
  user_id: string;
  company_id: string | null;
  source: string;
  origin: string;
}

export async function signState(claims: OAuthStateClaims): Promise<string> {
  const payload = { ...claims, ts: Date.now() };
  const body = b64urlEncode(JSON.stringify(payload));
  const sig = await hmacSha256(getSecret(), body);
  return `${body}.${sig}`;
}

export async function verifyState(state: string): Promise<OAuthStateClaims | null> {
  if (!state || !state.includes(".")) return null;
  const [body, sig] = state.split(".");
  if (!body || !sig) return null;

  let expected: string;
  try {
    expected = await hmacSha256(getSecret(), body);
  } catch {
    return null;
  }
  if (expected.length !== sig.length) return null;

  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  if (diff !== 0) return null;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(b64urlDecode(body));
  } catch {
    return null;
  }

  const ts = Number(parsed.ts);
  if (!Number.isFinite(ts) || Date.now() - ts > TTL_MS) return null;

  const userId = typeof parsed.user_id === "string" ? parsed.user_id : null;
  const source = typeof parsed.source === "string" ? parsed.source : null;
  const origin = typeof parsed.origin === "string" ? parsed.origin : null;
  if (!userId || !source || !origin) return null;

  const companyId = typeof parsed.company_id === "string" ? parsed.company_id : null;

  return { user_id: userId, company_id: companyId, source, origin };
}
