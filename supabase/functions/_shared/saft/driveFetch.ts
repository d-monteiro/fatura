// Helpers para descarregar ficheiros do Google Drive a partir de uma Edge
// Function (service_role). Usado pelo export-saft para apanhar PDFs que
// estão directamente no Drive (sync via email/cron) e não no bucket
// privado `invoices` no Storage Supabase.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export interface OAuthToken {
  id: string;
  access_token: string;
  refresh_token: string | null;
  token_expiry: string | null;
}

export async function getPrimaryDriveToken(
  admin: SupabaseClient, tenantId: string,
): Promise<OAuthToken | null> {
  const { data } = await admin.from("user_oauth_tokens")
    .select("id, access_token, refresh_token, token_expiry")
    .eq("tenant_id", tenantId)
    .eq("is_primary_storage", true)
    .eq("needs_reauth", false)
    .limit(1).maybeSingle();
  return (data as OAuthToken | null) ?? null;
}

// Buffer de 60s para evitar usar tokens prestes a expirar.
export async function ensureFreshAccessToken(
  admin: SupabaseClient, token: OAuthToken,
): Promise<string | null> {
  const expiresAt = token.token_expiry ? new Date(token.token_expiry).getTime() : 0;
  const stillValid = expiresAt > Date.now() + 60_000;
  if (stillValid) return token.access_token;

  if (!token.refresh_token) return null;
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  if (!clientId || !clientSecret) return null;

  let resp: Response;
  try {
    resp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: token.refresh_token,
        grant_type: "refresh_token",
      }),
    });
  } catch {
    return null;
  }
  if (!resp.ok) return null;
  const json = await resp.json();
  const newAccess = json.access_token as string;
  const expiresIn = (json.expires_in as number | undefined) ?? 3600;
  await admin.from("user_oauth_tokens").update({
    access_token: newAccess,
    token_expiry: new Date(Date.now() + expiresIn * 1000).toISOString(),
  }).eq("id", token.id);
  return newAccess;
}

export async function downloadDriveFile(
  accessToken: string, fileId: string,
): Promise<{ bytes: Uint8Array; mimeType: string | null } | null> {
  const resp = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!resp.ok) return null;
  const mimeType = resp.headers.get("content-type");
  return { bytes: new Uint8Array(await resp.arrayBuffer()), mimeType };
}

export function extensionFromMime(mime: string | null, fallback = "pdf"): string {
  if (!mime) return fallback;
  if (mime.includes("pdf")) return "pdf";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("png")) return "png";
  if (mime.includes("heic")) return "heic";
  if (mime.includes("webp")) return "webp";
  return fallback;
}
