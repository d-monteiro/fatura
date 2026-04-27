// Helper atómico para criar hierarquias de pastas no Google Drive.
// Substitui `ensureFolder` (que tinha race condition clássica check-then-create
// contra uma API que permite pastas duplicadas com o mesmo nome no mesmo parent).
//
// Idempotência vem de `drive_folders` em Postgres:
//   1. Cada prefix cumulativo do path tem linha única em (tenant_id, path_hash).
//   2. INSERT ... ON CONFLICT DO NOTHING serializa criações concorrentes.
//   3. Vencedor chama Drive API (search defensivo → create se inexistente) e
//      grava folder_id.
//   4. Perdedores fazem polling curto até o folder_id aparecer.
//   5. Linhas órfãs (folder_id NULL há > 30s — vencedor crashou) são reclamadas.

import type { createClient } from "jsr:@supabase/supabase-js@2";
import { driveLimiter } from "./rateLimiter.ts";
import { checkFileExists, createNewSpreadsheet } from "./drive.ts";

type SupabaseAdmin = ReturnType<typeof createClient>;

const DRIVE_TIMEOUT_MS = 30_000;
const LOCK_STALE_SECONDS = 30;
const POLL_INTERVAL_MS = 250;
const POLL_MAX_MS = 10_000;

function timeoutSignal(ms: number) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(id) };
}

// sha256 com namespace ('folder' | 'sheet') + tenantId + material. Primeiros
// 32 hex chars (16 bytes) é mais que suficiente contra colisão dentro do tenant.
// Namespace impede colisão entre folder e sheet no mesmo path (teoricamente
// nula mas torna lookups triviais em debugging).
async function hashKey(kind: "folder" | "sheet", tenantId: string, material: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${kind}::${tenantId}::${material.toLowerCase()}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest).slice(0, 16))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface DriveFolderHit {
  id: string;
  name: string;
  createdTime?: string;
}

// Lista pastas com este nome + parent. Ordenadas por createdTime asc — a mais
// antiga é a canónica quando há duplicados legacy do bug anterior.
async function searchFolders(
  accessToken: string,
  name: string,
  parentId: string | null,
): Promise<DriveFolderHit[]> {
  await driveLimiter.waitForSlot();
  const safeName = name.replace(/'/g, "\\'");
  let q = `mimeType='application/vnd.google-apps.folder' and name='${safeName}' and trashed=false`;
  if (parentId) q += ` and '${parentId}' in parents`;
  // Sem parent explícito — limitar ao root para evitar apanhar pastas com mesmo
  // nome em qualquer sítio da Drive do utilizador.
  else q += ` and 'root' in parents`;

  const t = timeoutSignal(DRIVE_TIMEOUT_MS);
  const resp = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}` +
      `&fields=files(id,name,createdTime)&orderBy=createdTime`,
    { headers: { Authorization: `Bearer ${accessToken}` }, signal: t.signal },
  );
  t.clear();
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Drive search ${resp.status}: ${txt.slice(0, 200)}`);
  }
  const data = await resp.json();
  return (data.files ?? []) as DriveFolderHit[];
}

async function createFolder(
  accessToken: string,
  name: string,
  parentId: string | null,
): Promise<string> {
  await driveLimiter.waitForSlot();
  const t = timeoutSignal(DRIVE_TIMEOUT_MS);
  const resp = await fetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: parentId ? [parentId] : undefined,
    }),
    signal: t.signal,
  });
  t.clear();
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Drive folder create ${resp.status}: ${txt.slice(0, 200)}`);
  }
  const data = await resp.json();
  if (!data.id) throw new Error("Pasta criada sem ID");
  return data.id as string;
}

export interface EnsureFolderPathResult {
  // Drive ID da pasta mais profunda (última do path).
  leafId: string;
  // Drive ID de cada segmento, na mesma ordem dos inputs. Útil para quem precisa
  // de pastas intermédias (ex: yearly folder para uma Sheet).
  segmentIds: string[];
}

// Garante que todos os segments existem como hierarquia de pastas, usando a
// tabela `drive_folders` para serializar criações concorrentes.
//
// segments deve ser o path completo (ex: ['FATURAS', 'EMPRESA', '2026', 'Abril']).
// O primeiro segmento é sempre filho do root da Drive do user (parent=null).
export async function ensureFolderPath(
  admin: SupabaseAdmin,
  tenantId: string,
  segments: string[],
  accessToken: string,
): Promise<EnsureFolderPathResult> {
  if (!accessToken) throw new Error("Token de acesso em falta");
  if (segments.length === 0) throw new Error("Path vazio");

  const segmentIds: string[] = [];
  let parentDriveId: string | null = null;

  for (let i = 0; i < segments.length; i++) {
    const name = segments[i];
    if (!name || !name.trim()) throw new Error(`Segmento #${i} vazio`);
    const prefix = segments.slice(0, i + 1);
    const pathHash = await hashKey("folder", tenantId, prefix.join("/"));
    const path = prefix.join("/");

    const folderId = await ensureSingleFolder(
      admin, tenantId, pathHash, path, name, parentDriveId, accessToken,
    );
    segmentIds.push(folderId);
    parentDriveId = folderId;
  }

  return { leafId: segmentIds[segmentIds.length - 1]!, segmentIds };
}

// Equivalente para o EXTRATO_<ano> dentro da year folder. Mesmo bug (search +
// create sem atomicidade) atacado com o mesmo mecanismo. Namespace 'sheet' no
// hash para não colidir com a pasta com igual nome (extremamente improvável
// mas evita a classe inteira de bugs).
export async function ensureYearlySheet(
  admin: SupabaseAdmin,
  tenantId: string,
  year: number,
  parentFolderId: string,
  accessToken: string,
  language = "pt",
): Promise<string> {
  const name = `EXTRATO_${year}`;
  const pathHash = await hashKey("sheet", tenantId, `${parentFolderId}/${year}`);

  const cached = await readCompleted(admin, tenantId, pathHash);
  if (cached) return cached;

  const acquired = await tryAcquireLock(admin, tenantId, pathHash, name, name, parentFolderId);
  if (acquired) {
    try {
      const existingId = await checkFileExists(accessToken, name, parentFolderId);
      const sheetId = existingId ?? (await createNewSpreadsheet(accessToken, name, parentFolderId, language)).id;
      await completeLock(admin, tenantId, pathHash, sheetId);
      return sheetId;
    } catch (e) {
      await releaseLock(admin, tenantId, pathHash);
      throw e;
    }
  }

  const waited = await waitForCompletion(admin, tenantId, pathHash);
  if (waited) return waited;

  const reclaimed = await reclaimStaleLock(admin, tenantId, pathHash, name, name, parentFolderId);
  if (reclaimed) {
    try {
      const existingId = await checkFileExists(accessToken, name, parentFolderId);
      const sheetId = existingId ?? (await createNewSpreadsheet(accessToken, name, parentFolderId, language)).id;
      await completeLock(admin, tenantId, pathHash, sheetId);
      return sheetId;
    } catch (e) {
      await releaseLock(admin, tenantId, pathHash);
      throw e;
    }
  }

  throw new Error(`Lock drive_folders bloqueado para sheet ${name} em ${parentFolderId}`);
}

async function ensureSingleFolder(
  admin: SupabaseAdmin,
  tenantId: string,
  pathHash: string,
  path: string,
  name: string,
  parentDriveId: string | null,
  accessToken: string,
): Promise<string> {
  // 1. Fast path: já em cache completo.
  const cached = await readCompleted(admin, tenantId, pathHash);
  if (cached) return cached;

  // 2. Tentar adquirir lock.
  const acquired = await tryAcquireLock(
    admin, tenantId, pathHash, path, name, parentDriveId,
  );

  if (acquired) {
    try {
      // Search defensivo: pode haver pasta legacy criada antes do sistema de
      // lock (e o bug antigo pode ter deixado múltiplas — usamos a mais antiga).
      const hits = await searchFolders(accessToken, name, parentDriveId);
      const folderId = hits.length > 0 ? hits[0].id : await createFolder(accessToken, name, parentDriveId);
      await completeLock(admin, tenantId, pathHash, folderId);
      return folderId;
    } catch (e) {
      // Libertar lock para permitir retry futuro sem esperar TTL.
      await releaseLock(admin, tenantId, pathHash);
      throw e;
    }
  }

  // 3. Perdi o lock — outro worker está a criar. Polling com TTL.
  const waited = await waitForCompletion(admin, tenantId, pathHash);
  if (waited) return waited;

  // 4. Lock abandonado (vencedor crashou). Tentar reclamar uma vez.
  const reclaimed = await reclaimStaleLock(
    admin, tenantId, pathHash, path, name, parentDriveId,
  );
  if (reclaimed) {
    try {
      const hits = await searchFolders(accessToken, name, parentDriveId);
      const folderId = hits.length > 0 ? hits[0].id : await createFolder(accessToken, name, parentDriveId);
      await completeLock(admin, tenantId, pathHash, folderId);
      return folderId;
    } catch (e) {
      await releaseLock(admin, tenantId, pathHash);
      throw e;
    }
  }

  throw new Error(`Lock drive_folders bloqueado para ${path} (>${POLL_MAX_MS}ms)`);
}

async function readCompleted(
  admin: SupabaseAdmin,
  tenantId: string,
  pathHash: string,
): Promise<string | null> {
  const { data } = await admin
    .from("drive_folders")
    .select("folder_id")
    .eq("tenant_id", tenantId)
    .eq("path_hash", pathHash)
    .not("folder_id", "is", null)
    .maybeSingle();
  return (data as { folder_id: string } | null)?.folder_id ?? null;
}

async function tryAcquireLock(
  admin: SupabaseAdmin,
  tenantId: string,
  pathHash: string,
  path: string,
  name: string,
  parentDriveId: string | null,
): Promise<boolean> {
  const { data, error } = await admin
    .from("drive_folders")
    .insert({
      tenant_id: tenantId,
      path_hash: pathHash,
      path,
      name,
      parent_drive_id: parentDriveId,
      folder_id: null,
    })
    .select("path_hash");
  if (error) {
    // 23505 = unique_violation = conflict. Significa que outro worker já
    // tem o lock (ou já completou).
    if ((error as { code?: string }).code === "23505") return false;
    throw error;
  }
  return (data?.length ?? 0) > 0;
}

async function completeLock(
  admin: SupabaseAdmin,
  tenantId: string,
  pathHash: string,
  folderId: string,
): Promise<void> {
  const { error } = await admin
    .from("drive_folders")
    .update({ folder_id: folderId, completed_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("path_hash", pathHash);
  if (error) throw error;
}

async function releaseLock(
  admin: SupabaseAdmin,
  tenantId: string,
  pathHash: string,
): Promise<void> {
  // Só apagar se ainda está pending — não apagar um lock completo.
  await admin
    .from("drive_folders")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("path_hash", pathHash)
    .is("folder_id", null);
}

async function waitForCompletion(
  admin: SupabaseAdmin,
  tenantId: string,
  pathHash: string,
): Promise<string | null> {
  const deadline = Date.now() + POLL_MAX_MS;
  while (Date.now() < deadline) {
    const id = await readCompleted(admin, tenantId, pathHash);
    if (id) return id;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  return null;
}

// Se encontrou row pending > LOCK_STALE_SECONDS, assume vencedor crashou e
// toma posse (UPDATE atómico filtrado por idade).
async function reclaimStaleLock(
  admin: SupabaseAdmin,
  tenantId: string,
  pathHash: string,
  path: string,
  name: string,
  parentDriveId: string | null,
): Promise<boolean> {
  const staleCutoff = new Date(Date.now() - LOCK_STALE_SECONDS * 1000).toISOString();
  const { data, error } = await admin
    .from("drive_folders")
    .update({
      created_at: new Date().toISOString(),
      path, name, parent_drive_id: parentDriveId,
    })
    .eq("tenant_id", tenantId)
    .eq("path_hash", pathHash)
    .is("folder_id", null)
    .lt("created_at", staleCutoff)
    .select("path_hash");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}
