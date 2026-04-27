// ============================================
// Edge Function: drive-folders-dedup
// Limpa pastas e sheets duplicadas criadas pelo bug do ensureFolder legacy
// (check-then-create sem atomicidade). Popula `drive_folders` cache com IDs
// canónicos para os novos helpers reusarem sem bater na Drive API.
//
// Request: POST { tenant_id, execute: false }
//   execute=false (default): só devolve plano (dry-run).
//   execute=true: move ficheiros para a pasta canónica + trash dos duplicados +
//                 escreve drive_folders cache. Sheets: trash das não-canónicas
//                 (dados ficam só na canónica — admin confirma antes).
//
// Segurança:
//   - Internal (x-internal-secret = service role): qualquer tenant.
//   - Admin JWT: qualquer tenant.
//   - User JWT: só o próprio tenant (via tenant_users).
// ============================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { logEdgeError } from "../_shared/logError.ts";

type Supa = ReturnType<typeof createClient>;

const DRIVE_TIMEOUT_MS = 30_000;
const KNOWN_ROOTS = ["FATURAS"];

interface DriveFolder {
  id: string;
  name: string;
  createdTime: string;
  parents?: string[];
}

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  createdTime: string;
  parents?: string[];
}

interface DupeGroup {
  name: string;
  parent: string | null;
  path: string;
  canonical: { id: string; createdTime: string };
  duplicates: { id: string; createdTime: string; children_count: number }[];
}

interface DedupPlan {
  folder_duplicates: DupeGroup[];
  sheet_duplicates: DupeGroup[];
  cache_entries: { path: string; folder_id: string; parent_drive_id: string | null; kind: "folder" | "sheet" }[];
  root_folder_id: string | null;
}

interface DedupResult {
  files_moved: number;
  folders_trashed: number;
  sheets_trashed: number;
  cache_rows_upserted: number;
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" }, corsHeaders);

  const runId = crypto.randomUUID();
  const t0 = Date.now();

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";

  const internalHeader = req.headers.get("x-internal-secret");
  const isInternal = !!internalHeader && internalHeader === serviceKey;
  const cronSecret = Deno.env.get("CRON_SECRET") || "";
  const cronHeader = req.headers.get("x-cron-secret");
  const isCron = !!cronSecret && cronHeader === cronSecret;

  let body: { tenant_id?: string; execute?: boolean } = {};
  try { body = await req.json(); } catch { /* noop */ }
  if (!body.tenant_id) return json(400, { error: "tenant_id obrigatório" }, corsHeaders);
  const tenantId = body.tenant_id;
  const execute = body.execute === true;

  let callerUserId: string | null = null;
  let isAdmin = false;
  if (!isInternal && !isCron) {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { error: "Unauthorized" }, corsHeaders);
    const userClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json(401, { error: "Unauthorized" }, corsHeaders);
    callerUserId = user.id;
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data: adminRow } = await admin.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
    isAdmin = !!adminRow;
    if (!isAdmin) {
      const { data: mem } = await admin.from("tenant_users")
        .select("tenant_id").eq("user_id", user.id).eq("tenant_id", tenantId).eq("is_active", true).maybeSingle();
      if (!mem) return json(403, { error: "Sem acesso a este tenant" }, corsHeaders);
    }
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  console.log(`[dedup][${runId}] tenant=${tenantId} execute=${execute} caller=${callerUserId ?? "internal"}`);

  // 1. Access token do dono do tenant (primary storage token)
  const accessToken = await loadAccessToken(admin, tenantId);
  if (!accessToken) {
    return json(400, { error: "Sem access_token Google válido para o tenant" }, corsHeaders);
  }

  try {
    const plan = await buildPlan(accessToken, tenantId);
    if (!execute) {
      const elapsed = Date.now() - t0;
      return json(200, { run_id: runId, tenant_id: tenantId, executed: false, plan, elapsed_ms: elapsed }, corsHeaders);
    }

    const result = await executePlan(admin, accessToken, tenantId, plan);
    const elapsed = Date.now() - t0;
    console.log(`[dedup][${runId}] done elapsed=${elapsed}ms ${JSON.stringify(result)}`);
    return json(200, { run_id: runId, tenant_id: tenantId, executed: true, plan, result, elapsed_ms: elapsed }, corsHeaders);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await logEdgeError({
      functionName: "drive-folders-dedup", level: "error",
      message: msg, error: e, tenantId,
      metadata: { run_id: runId, execute },
    });
    return json(500, { error: msg, run_id: runId }, corsHeaders);
  }
});

async function loadAccessToken(admin: Supa, tenantId: string): Promise<string | null> {
  // Dono do tenant (owner is_active) com token Google primary_storage.
  const { data: tu } = await admin
    .from("tenant_users").select("user_id").eq("tenant_id", tenantId)
    .eq("role", "owner").eq("is_active", true).limit(1).maybeSingle();
  const userId = (tu as { user_id: string } | null)?.user_id;
  if (!userId) return null;

  const { data: tok } = await admin
    .from("user_oauth_tokens")
    .select("access_token, refresh_token, token_expiry")
    .eq("user_id", userId).eq("provider", "google")
    .order("is_primary_storage", { ascending: false }).limit(1).maybeSingle();
  if (!tok) return null;
  const row = tok as { access_token: string; refresh_token: string | null; token_expiry: string | null };

  const expiresAt = row.token_expiry ? new Date(row.token_expiry).getTime() : 0;
  if (row.access_token && expiresAt > Date.now() + 60_000) return row.access_token;
  if (!row.refresh_token) return null;

  const clientId = Deno.env.get("GOOGLE_CLIENT_ID")!;
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId, client_secret: clientSecret,
      refresh_token: row.refresh_token, grant_type: "refresh_token",
    }),
  });
  if (!resp.ok) return null;
  const t = await resp.json();
  const newAccess = t.access_token as string;
  await admin.from("user_oauth_tokens").update({
    access_token: newAccess,
    token_expiry: new Date(Date.now() + ((t.expires_in as number) || 3600) * 1000).toISOString(),
  }).eq("user_id", userId).eq("provider", "google");
  return newAccess;
}

// ─────────────────────────────────────────────────────────────────────────────
// PLANO

async function buildPlan(accessToken: string, tenantId: string): Promise<DedupPlan> {
  // 1. Encontrar todas as pastas no root com nome conhecido (FATURAS e variantes).
  //    Pode haver 2-3 por causa do bug — vamos agrupar.
  const roots: DriveFolder[] = [];
  for (const name of KNOWN_ROOTS) {
    const found = await searchFolders(accessToken, name, "root");
    roots.push(...found);
  }
  // Agrupar por nome
  const rootsByName = new Map<string, DriveFolder[]>();
  for (const r of roots) {
    const list = rootsByName.get(r.name) ?? [];
    list.push(r);
    rootsByName.set(r.name, list);
  }

  const folderDupes: DupeGroup[] = [];
  const sheetDupes: DupeGroup[] = [];
  const cache: DedupPlan["cache_entries"] = [];

  // Canonical root = o mais antigo entre TODOS os roots conhecidos.
  // (Se há FATURAS e FACTURAS, fica o mais antigo — probable scenario: só FATURAS.)
  const allRoots = roots.slice().sort((a, b) => (a.createdTime || "").localeCompare(b.createdTime || ""));
  const canonicalRoot = allRoots[0] ?? null;
  if (!canonicalRoot) {
    return { folder_duplicates: [], sheet_duplicates: [], cache_entries: [], root_folder_id: null };
  }

  // Report de duplicados no nível root (só se houver > 1 com MESMO nome)
  for (const [name, list] of rootsByName) {
    if (list.length <= 1) continue;
    const sorted = list.slice().sort((a, b) => (a.createdTime || "").localeCompare(b.createdTime || ""));
    const canonical = sorted[0];
    const dupes = await Promise.all(sorted.slice(1).map(async (d) => ({
      id: d.id, createdTime: d.createdTime,
      children_count: (await listChildren(accessToken, d.id)).length,
    })));
    folderDupes.push({ name, parent: "root", path: name, canonical: { id: canonical.id, createdTime: canonical.createdTime }, duplicates: dupes });
  }

  cache.push({ path: canonicalRoot.name, folder_id: canonicalRoot.id, parent_drive_id: null, kind: "folder" });

  // 2. Descer recursivamente a partir da canonical root, agrupando duplicados por nível.
  await walkAndPlan(accessToken, canonicalRoot, canonicalRoot.name, folderDupes, sheetDupes, cache);

  return {
    folder_duplicates: folderDupes,
    sheet_duplicates: sheetDupes,
    cache_entries: cache,
    root_folder_id: canonicalRoot.id,
  };
}

// Desce BFS, parent canónico por nome a cada nível. Max depth 6 — além disso
// não é estrutura da app, é user-created.
async function walkAndPlan(
  accessToken: string,
  current: DriveFolder,
  currentPath: string,
  folderDupes: DupeGroup[],
  sheetDupes: DupeGroup[],
  cache: DedupPlan["cache_entries"],
  depth = 0,
): Promise<void> {
  if (depth > 5) return;

  const children = await listChildren(accessToken, current.id);
  const folders = children.filter((c) => c.mimeType === "application/vnd.google-apps.folder");
  const sheets = children.filter((c) => c.mimeType === "application/vnd.google-apps.spreadsheet");

  // Group folders by name
  const foldersByName = new Map<string, DriveFolder[]>();
  for (const f of folders) {
    const list = foldersByName.get(f.name) ?? [];
    list.push(f as DriveFolder);
    foldersByName.set(f.name, list);
  }
  for (const [name, list] of foldersByName) {
    const sorted = list.slice().sort((a, b) => (a.createdTime || "").localeCompare(b.createdTime || ""));
    const canonical = sorted[0];
    const childPath = `${currentPath}/${name}`;
    cache.push({ path: childPath, folder_id: canonical.id, parent_drive_id: current.id, kind: "folder" });
    if (list.length > 1) {
      const dupes = await Promise.all(sorted.slice(1).map(async (d) => ({
        id: d.id, createdTime: d.createdTime,
        children_count: (await listChildren(accessToken, d.id)).length,
      })));
      folderDupes.push({ name, parent: current.id, path: childPath, canonical: { id: canonical.id, createdTime: canonical.createdTime }, duplicates: dupes });
    }
    // Recursa só na canónica — as duplicadas vão ser mergidas nela no execute.
    await walkAndPlan(accessToken, canonical, childPath, folderDupes, sheetDupes, cache, depth + 1);
  }

  // Group sheets by name
  const sheetsByName = new Map<string, DriveFile[]>();
  for (const s of sheets) {
    const list = sheetsByName.get(s.name) ?? [];
    list.push(s);
    sheetsByName.set(s.name, list);
  }
  for (const [name, list] of sheetsByName) {
    if (list.length <= 1) {
      // Cache a canónica mesmo sem duplicados — para ensureYearlySheet a reusar.
      cache.push({ path: `${currentPath}/${name}`, folder_id: list[0].id, parent_drive_id: current.id, kind: "sheet" });
      continue;
    }
    const sorted = list.slice().sort((a, b) => (a.createdTime || "").localeCompare(b.createdTime || ""));
    const canonical = sorted[0];
    const sheetPath = `${currentPath}/${name}`;
    cache.push({ path: sheetPath, folder_id: canonical.id, parent_drive_id: current.id, kind: "sheet" });
    sheetDupes.push({
      name, parent: current.id, path: sheetPath,
      canonical: { id: canonical.id, createdTime: canonical.createdTime },
      duplicates: sorted.slice(1).map((d) => ({ id: d.id, createdTime: d.createdTime, children_count: 0 })),
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// EXECUÇÃO

async function executePlan(
  admin: Supa, accessToken: string, tenantId: string, plan: DedupPlan,
): Promise<DedupResult> {
  const result: DedupResult = { files_moved: 0, folders_trashed: 0, sheets_trashed: 0, cache_rows_upserted: 0 };

  // Pastas — para cada grupo, mover filhos da duplicada para a canónica, depois trash.
  for (const group of plan.folder_duplicates) {
    for (const dupe of group.duplicates) {
      const moved = await moveChildrenTo(accessToken, dupe.id, group.canonical.id);
      result.files_moved += moved;
      await trashFile(accessToken, dupe.id);
      result.folders_trashed++;
    }
  }

  // Sheets — trash direto (não merge: dados ficam na canónica; app reaparece agora).
  // OBS: como a canónica é a mais antiga, as rows posteriores do Gemini no append
  // foram para as "duplicadas". Depois do dedup, linhas novas vão todas para a canónica.
  // Linhas históricas dos EXTRATO_YYYY duplicados perdem-se — mas o user tem
  // sempre os PDFs no Drive e pode re-gerar o extrato. Dedup é só para UI limpo.
  for (const group of plan.sheet_duplicates) {
    for (const dupe of group.duplicates) {
      await trashFile(accessToken, dupe.id);
      result.sheets_trashed++;
    }
  }

  // Popular cache com todos os canonical IDs conhecidos.
  for (const entry of plan.cache_entries) {
    const pathHash = await hashKey(entry.kind, tenantId, pathMaterialFor(entry));
    await admin.from("drive_folders").upsert({
      tenant_id: tenantId,
      path_hash: pathHash,
      path: entry.path,
      name: entry.path.split("/").pop() ?? entry.path,
      parent_drive_id: entry.parent_drive_id,
      folder_id: entry.folder_id,
      completed_at: new Date().toISOString(),
    }, { onConflict: "tenant_id,path_hash" });
    result.cache_rows_upserted++;
  }

  // Backfill drive_root_folder_id do tenant.
  if (plan.root_folder_id) {
    await admin.from("tenants").update({ drive_root_folder_id: plan.root_folder_id }).eq("id", tenantId);
  }

  return result;
}

function pathMaterialFor(entry: { path: string; parent_drive_id: string | null; kind: "folder" | "sheet" }): string {
  // Tem que bater com hashKey do driveFolders.ts:
  //   folder: material = path.join("/") (lower-case feito no hash)
  //   sheet:  material = parent_drive_id + "/" + year  (name é EXTRATO_YEAR)
  if (entry.kind === "folder") return entry.path;
  const name = entry.path.split("/").pop() ?? "";
  const yearMatch = name.match(/(\d{4})/);
  const year = yearMatch?.[1] ?? "0";
  return `${entry.parent_drive_id ?? "root"}/${year}`;
}

async function hashKey(kind: "folder" | "sheet", tenantId: string, material: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${kind}::${tenantId}::${material.toLowerCase()}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest).slice(0, 16))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ─────────────────────────────────────────────────────────────────────────────
// Drive API primitives

function timeoutSignal(ms: number) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(id) };
}

async function searchFolders(accessToken: string, name: string, parentId: string): Promise<DriveFolder[]> {
  const safeName = name.replace(/'/g, "\\'");
  const q = `mimeType='application/vnd.google-apps.folder' and name='${safeName}' and trashed=false and '${parentId}' in parents`;
  const t = timeoutSignal(DRIVE_TIMEOUT_MS);
  const resp = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,createdTime,parents)&orderBy=createdTime`,
    { headers: { Authorization: `Bearer ${accessToken}` }, signal: t.signal },
  );
  t.clear();
  if (!resp.ok) throw new Error(`search ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  const data = await resp.json();
  return (data.files ?? []) as DriveFolder[];
}

async function listChildren(accessToken: string, parentId: string): Promise<DriveFile[]> {
  const all: DriveFile[] = [];
  let pageToken: string | undefined;
  do {
    const q = `'${parentId}' in parents and trashed=false`;
    const url = new URL("https://www.googleapis.com/drive/v3/files");
    url.searchParams.set("q", q);
    url.searchParams.set("fields", "nextPageToken,files(id,name,mimeType,createdTime,parents)");
    url.searchParams.set("pageSize", "200");
    url.searchParams.set("orderBy", "createdTime");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const t = timeoutSignal(DRIVE_TIMEOUT_MS);
    const resp = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` }, signal: t.signal });
    t.clear();
    if (!resp.ok) throw new Error(`list ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
    const data = await resp.json();
    all.push(...(data.files ?? []) as DriveFile[]);
    pageToken = data.nextPageToken;
  } while (pageToken);
  return all;
}

async function moveChildrenTo(accessToken: string, fromFolderId: string, toFolderId: string): Promise<number> {
  const children = await listChildren(accessToken, fromFolderId);
  let moved = 0;
  for (const c of children) {
    // PATCH com addParents + removeParents move atomicamente.
    const t = timeoutSignal(DRIVE_TIMEOUT_MS);
    const resp = await fetch(
      `https://www.googleapis.com/drive/v3/files/${c.id}?addParents=${toFolderId}&removeParents=${fromFolderId}&fields=id,parents`,
      { method: "PATCH", headers: { Authorization: `Bearer ${accessToken}` }, signal: t.signal },
    );
    t.clear();
    if (resp.ok) moved++;
    else console.warn(`[dedup] move_failed id=${c.id} from=${fromFolderId} to=${toFolderId} status=${resp.status}`);
  }
  return moved;
}

async function trashFile(accessToken: string, fileId: string): Promise<void> {
  const t = timeoutSignal(DRIVE_TIMEOUT_MS);
  const resp = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,trashed`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ trashed: true }),
      signal: t.signal,
    },
  );
  t.clear();
  if (!resp.ok) throw new Error(`trash ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
}

function json(status: number, body: unknown, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { ...cors, "Content-Type": "application/json" },
  });
}
