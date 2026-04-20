// ============================================
// finalizeInvoice — completa o pipeline depois do Gemini:
//   dedup → company detect → supplier match → validate → Drive hierarchy →
//   upload Drive → Sheets append → (opcional) limpa Storage.
// Chamado por analyze-document (fim do modo by-invoice) e por reprocess-pending.
// Idempotente: se drive_file_id já existe, salta upload/sheets.
// ============================================

import type { createClient } from "jsr:@supabase/supabase-js@2";
import {
  ensureFolder,
  fileExistsById,
  getOrCreateYearlySheet,
  uploadInvoiceToDrive,
} from "./drive.ts";
import { appendInvoiceToSheet } from "./sheets.ts";
import { formatMonthFolder } from "./months.ts";
import { normalizeSupplierName, type KnownSupplier } from "./suppliers.ts";
import { validateMontants } from "./validation.ts";
import { logEdgeError } from "./logError.ts";

type SupabaseAdmin = ReturnType<typeof createClient>;

export interface FinalizeOptions {
  // Se true, remove o ficheiro do bucket após Drive confirmado.
  deleteStorageAfterDrive?: boolean;
}

export interface FinalizeResult {
  ok: boolean;
  invoiceId: string;
  stage: string;
  reason?: string;
  drive_file_id?: string | null;
  already_done?: boolean;
}

interface InvoiceRow {
  id: string;
  tenant_id: string;
  user_id: string | null;
  company_id: string | null;
  status: string;
  source: string;
  storage_path: string | null;
  file_url: string | null;
  drive_file_id: string | null;
  drive_link: string | null;
  spreadsheet_id: string | null;
  doc_date: string | null;
  doc_year: number | null;
  doc_number: string | null;
  supplier_name: string | null;
  supplier_nif: string | null;
  supplier_id: string | null;
  cost_type: string | null;
  metier: string | null;
  nature_depense: string | null;
  montant_ht: number | null;
  montant_tva: number | null;
  montant_ttc: number | null;
  taux_tva: number | null;
  summary: string | null;
  destinataire_name: string | null;
  review_reason: string | null;
  manual_review: boolean | null;
}

interface TenantRow {
  id: string;
  language: string | null;
  folder_structure: string | null;
  drive_root_folder_name: string | null;
  auto_sheets: boolean | null;
}

interface CompanyRow {
  id: string;
  name: string;
  short_name: string | null;
  is_active: boolean;
  is_default: boolean | null;
}

const DRIVE_TOKEN_BUFFER_MS = 5 * 60 * 1000;

export async function finalizeInvoice(
  invoiceId: string,
  admin: SupabaseAdmin,
  opts: FinalizeOptions = {},
): Promise<FinalizeResult> {
  const runId = crypto.randomUUID();
  const log = (stage: string, msg: string, extra?: Record<string, unknown>) =>
    console.log(`[finalize][${runId}][${invoiceId}][${stage}] ${msg}`, extra ?? "");

  log("start", "begin", { opts });

  // 1. Load invoice
  const { data: invRaw, error: invErr } = await admin
    .from("invoices")
    .select("id, tenant_id, user_id, company_id, status, source, storage_path, file_url, drive_file_id, drive_link, spreadsheet_id, doc_date, doc_year, doc_number, supplier_name, supplier_nif, supplier_id, cost_type, metier, nature_depense, montant_ht, montant_tva, montant_ttc, taux_tva, summary, destinataire_name, review_reason, manual_review")
    .eq("id", invoiceId)
    .is("deleted_at", null)
    .maybeSingle();
  if (invErr || !invRaw) {
    await logEdgeError({
      functionName: "finalize-invoice",
      level: "error",
      message: "Invoice não encontrada",
      metadata: { run_id: runId, invoice_id: invoiceId, db_error: invErr?.message },
    });
    return { ok: false, invoiceId, stage: "load_invoice", reason: invErr?.message ?? "not_found" };
  }
  const invoice = invRaw as unknown as InvoiceRow;

  // Idempotência: se já tem drive_file_id, salta — só faz sheets se faltar.
  if (invoice.drive_file_id) {
    log("idempotent", "drive_file_id já existe");
    return { ok: true, invoiceId, stage: "already_done", drive_file_id: invoice.drive_file_id, already_done: true };
  }

  if (!invoice.supplier_name && !invoice.montant_ttc) {
    // Sem dados do Gemini — nada a fazer aqui.
    return { ok: false, invoiceId, stage: "no_gemini_data", reason: "Gemini não preencheu os dados" };
  }

  // 2. Load tenant
  const { data: tenantRaw } = await admin
    .from("tenants")
    .select("id, language, folder_structure, drive_root_folder_name, auto_sheets")
    .eq("id", invoice.tenant_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!tenantRaw) {
    await markReason(admin, invoiceId, "Tenant não encontrado");
    return { ok: false, invoiceId, stage: "load_tenant", reason: "tenant_missing" };
  }
  const tenant = tenantRaw as unknown as TenantRow;
  const language = tenant.language ?? "pt";
  const folderStructure = tenant.folder_structure ?? "year_month";
  const rootFolderName = tenant.drive_root_folder_name ?? "FATURAS";
  const autoSheets = tenant.auto_sheets !== false;

  // 3. OAuth token (primary Google account do user)
  const userId = invoice.user_id;
  if (!userId) {
    await markReason(admin, invoiceId, "Invoice sem user_id");
    return { ok: false, invoiceId, stage: "load_token", reason: "no_user_id" };
  }
  const accessToken = await ensureFreshAccessToken(admin, userId, runId, invoice.tenant_id);
  if (!accessToken) {
    await markReason(admin, invoiceId, "Token Google indisponível — reautoriza em Definições");
    return { ok: false, invoiceId, stage: "load_token", reason: "no_token" };
  }
  log("token", "ok");

  // 4. Load companies + suppliers para matching
  const { data: companiesRaw } = await admin
    .from("companies")
    .select("id, name, short_name, is_active, is_default")
    .eq("tenant_id", invoice.tenant_id)
    .eq("is_active", true)
    .order("is_default", { ascending: false })
    .order("name");
  const companies = (companiesRaw ?? []) as unknown as CompanyRow[];
  if (companies.length === 0) {
    await markReason(admin, invoiceId, "Sem empresas no tenant — cria uma em Definições");
    return { ok: false, invoiceId, stage: "load_companies", reason: "no_companies" };
  }

  const { data: suppliersRaw } = await admin
    .from("suppliers")
    .select("id, name, name_variations")
    .eq("tenant_id", invoice.tenant_id)
    .limit(500);
  const suppliers = (suppliersRaw ?? []) as unknown as Array<{ id: string; name: string; name_variations: string[] | null }>;
  const knownSuppliers: KnownSupplier[] = suppliers.map((s) => ({
    normalized: s.name,
    variations: s.name_variations ?? [],
  }));

  // 5. Normalizar supplier_name (contra lista do tenant)
  const normalizedSupplier = normalizeSupplierName(invoice.supplier_name, knownSuppliers);
  const supplierChanged = normalizedSupplier !== invoice.supplier_name;

  // 6. Dedup por doc_number OR (supplier, data, total) — soft-delete em vez de
  // status=failed: o ficheiro original já está na invoice "vencedora", esta
  // linha é só ruído. Mantém o registo para audit mas tira-o do UI e liberta
  // o Storage. reprocess-pending ignora (só apanha deleted_at IS NULL).
  const dup = await findDuplicate(admin, invoice, normalizedSupplier);
  if (dup) {
    await admin.from("invoices").update({
      status: "failed",
      manual_review: false,
      review_reason: `Duplicada de ${dup}`,
      deleted_at: new Date().toISOString(),
    }).eq("id", invoiceId);
    if (invoice.storage_path) {
      await admin.storage.from("invoices").remove([invoice.storage_path]);
    }
    log("dedup", "soft-delete (duplicada)", { dup_of: dup });
    return { ok: true, invoiceId, stage: "dedup", reason: `dup_of:${dup}`, already_done: true };
  }

  // 7. Company detection (override via destinataire_name)
  const detectedCompanyId = detectCompany(companies, invoice.destinataire_name, invoice.company_id);
  if (!detectedCompanyId) {
    await markReason(admin, invoiceId, "Não foi possível detectar a empresa");
    return { ok: false, invoiceId, stage: "company_detect", reason: "no_company" };
  }
  const company = companies.find((c) => c.id === detectedCompanyId)!;
  log("company", `id=${detectedCompanyId} name=${company.name}`);

  // 8. Supplier match/create
  let supplierId = invoice.supplier_id;
  if (!supplierId && normalizedSupplier) {
    supplierId = await matchOrCreateSupplier(
      admin, invoice.tenant_id, normalizedSupplier, invoice.supplier_nif, suppliers,
    );
  }

  // 9. validateMontants
  const vm = validateMontants(invoice.montant_ht, invoice.montant_tva, invoice.montant_ttc, invoice.taux_tva);
  const needsReviewFromValidation = !vm.valid;

  // 10. Folder path
  const coName = (company.short_name || company.name || "EMPRESA").trim();
  const yearCandidate = invoice.doc_year || (invoice.doc_date ? new Date(invoice.doc_date).getFullYear() : new Date().getFullYear());
  const monthIdx = invoice.doc_date ? new Date(invoice.doc_date).getMonth() : new Date().getMonth();
  const monthLabel = formatMonthFolder(monthIdx, language);
  const costTypeLabel = invoice.cost_type
    ? invoice.cost_type.charAt(0).toUpperCase() + invoice.cost_type.slice(1).replace(/_/g, " ")
    : "Outros";
  const path = buildFolderPath(folderStructure, rootFolderName, coName, yearCandidate, monthLabel, costTypeLabel, normalizedSupplier || "OUTROS");

  let parentId = "";
  try {
    for (const segment of path) {
      parentId = await ensureFolder(accessToken, segment, parentId || null);
    }
    log("folders", `path=${path.join("/")} parent=${parentId}`);
  } catch (e) {
    await logAndReview(admin, invoiceId, runId, invoice.tenant_id, "drive_folders", e);
    return { ok: false, invoiceId, stage: "drive_folders", reason: errString(e) };
  }

  // 11. Yearly sheet
  let sheetId: string | null = invoice.spreadsheet_id;
  if (autoSheets && !sheetId) {
    try {
      const yearRoot = await ensureFolder(accessToken, rootFolderName, null);
      const coFolder = await ensureFolder(accessToken, coName, yearRoot);
      const yearFolder = await ensureFolder(accessToken, String(yearCandidate), coFolder);
      sheetId = await getOrCreateYearlySheet(accessToken, yearCandidate, yearFolder, language);
      log("sheets", `sheet_id=${sheetId}`);
    } catch (e) {
      await logEdgeError({
        functionName: "finalize-invoice", level: "warn",
        message: "Falha a criar Sheet anual — continua sem Sheets",
        error: e, userId, tenantId: invoice.tenant_id,
        metadata: { run_id: runId, invoice_id: invoiceId },
      });
      sheetId = null;
    }
  }

  // 12. Download Storage → Upload Drive
  if (!invoice.storage_path) {
    await markReason(admin, invoiceId, "Sem storage_path para upload ao Drive");
    return { ok: false, invoiceId, stage: "download", reason: "no_storage_path" };
  }
  const { data: file, error: dlErr } = await admin.storage
    .from("invoices")
    .download(invoice.storage_path);
  if (dlErr || !file) {
    await logAndReview(admin, invoiceId, runId, invoice.tenant_id, "download", dlErr ?? new Error("sem file"));
    return { ok: false, invoiceId, stage: "download", reason: dlErr?.message ?? "no_file" };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = (file.type || "application/pdf").toLowerCase();
  const ext = mime.includes("pdf") ? "pdf" : mime.includes("png") ? "png" : "jpg";
  const safeName = `${invoice.doc_date || "sem-data"}_${normalizedSupplier || "SEM_FORNECEDOR"}_${(invoice.montant_ttc ?? 0).toFixed(2)}.${ext}`
    .replace(/[/\\?%*:|"<>]/g, "_");

  let driveFileId = "";
  let driveLink = "";
  try {
    const up = await uploadInvoiceToDrive(accessToken, bytes, safeName, parentId, mime);
    driveFileId = up.id;
    driveLink = up.webViewLink;
    log("drive_upload", `ok id=${driveFileId}`);
  } catch (e) {
    await logAndReview(admin, invoiceId, runId, invoice.tenant_id, "drive_upload", e);
    return { ok: false, invoiceId, stage: "drive_upload", reason: errString(e) };
  }

  // 13. Persist IDs ANTES de Sheets/Storage cleanup — garante que não perdemos o Drive ID
  const updateBeforeSheets: Record<string, unknown> = {
    drive_file_id: driveFileId,
    drive_link: driveLink,
    spreadsheet_id: sheetId,
    company_id: detectedCompanyId,
    supplier_id: supplierId,
  };
  if (supplierChanged) updateBeforeSheets.supplier_name = normalizedSupplier;
  if (needsReviewFromValidation) {
    updateBeforeSheets.status = "review";
    updateBeforeSheets.manual_review = true;
    updateBeforeSheets.review_reason = `Validação: ${vm.errors.join("; ")}`;
  }
  const { error: updErr } = await admin.from("invoices").update(updateBeforeSheets).eq("id", invoiceId);
  if (updErr) {
    await logEdgeError({
      functionName: "finalize-invoice", level: "error",
      message: "UPDATE pós-Drive falhou",
      error: updErr, userId, tenantId: invoice.tenant_id,
      metadata: { run_id: runId, invoice_id: invoiceId, drive_file_id: driveFileId },
    });
    // Não retornamos — o Drive já foi feito. Continuamos para Sheets.
  }

  // 14. Append Sheets
  if (sheetId) {
    try {
      await appendInvoiceToSheet(accessToken, sheetId, {
        doc_date: invoice.doc_date,
        supplier_name: normalizedSupplier,
        supplier_nif: invoice.supplier_nif,
        metier: invoice.metier,
        nature_depense: invoice.nature_depense,
        cost_type: invoice.cost_type,
        doc_number: invoice.doc_number,
        montant_ht: invoice.montant_ht,
        montant_tva: invoice.montant_tva,
        montant_ttc: invoice.montant_ttc,
        taux_tva: invoice.taux_tva,
        summary: invoice.summary,
        drive_link: driveLink,
      }, language);
      log("sheets_append", "ok");
    } catch (e) {
      await logEdgeError({
        functionName: "finalize-invoice", level: "warn",
        message: "Sheets append falhou — invoice continua em Drive",
        error: e, userId, tenantId: invoice.tenant_id,
        metadata: { run_id: runId, invoice_id: invoiceId, sheet_id: sheetId },
      });
    }
  }

  // 15. Cleanup Storage — só depois de confirmar que o file existe no Drive
  if (opts.deleteStorageAfterDrive) {
    try {
      const exists = await fileExistsById(accessToken, driveFileId);
      if (exists) {
        await admin.storage.from("invoices").remove([invoice.storage_path]);
        // file_url passa a Drive link; storage_path null indica "não está cá"
        await admin.from("invoices").update({
          file_url: driveLink,
          storage_path: null,
        }).eq("id", invoiceId);
        log("storage_cleanup", "ok");
      } else {
        log("storage_cleanup", "SKIP — Drive file não confirmado");
      }
    } catch (e) {
      await logEdgeError({
        functionName: "finalize-invoice", level: "warn",
        message: "Storage cleanup falhou — invoice continua OK",
        error: e, userId, tenantId: invoice.tenant_id,
        metadata: { run_id: runId, invoice_id: invoiceId, storage_path: invoice.storage_path },
      });
    }
  }

  log("done", `drive=${driveFileId}`);
  return { ok: true, invoiceId, stage: "done", drive_file_id: driveFileId };
}

// ─────────────────────────────────────────────────────────────────────────────

async function ensureFreshAccessToken(
  admin: SupabaseAdmin,
  userId: string,
  runId: string,
  tenantId: string,
): Promise<string | null> {
  const { data } = await admin
    .from("user_oauth_tokens")
    .select("id, email, access_token, refresh_token, token_expiry")
    .eq("user_id", userId)
    .eq("provider", "google")
    .order("is_primary_storage", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const row = data as { id: string; email: string | null; access_token: string; refresh_token: string | null; token_expiry: string | null };

  const expiresAt = row.token_expiry ? new Date(row.token_expiry).getTime() : 0;
  if (row.access_token && expiresAt > Date.now() + DRIVE_TOKEN_BUFFER_MS) {
    return row.access_token;
  }
  if (!row.refresh_token) {
    await admin.from("user_oauth_tokens").update({
      needs_reauth: true,
      reauth_reason: "sem_refresh_token",
      reauth_flagged_at: new Date().toISOString(),
    }).eq("id", row.id);
    await logEdgeError({
      functionName: "finalize-invoice", level: "warn",
      message: "OAuth token expirado sem refresh_token",
      userId, tenantId,
      metadata: { run_id: runId, email: row.email },
    });
    return null;
  }

  const clientId = Deno.env.get("GOOGLE_CLIENT_ID")!;
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
  try {
    const resp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: row.refresh_token,
        grant_type: "refresh_token",
      }),
    });
    if (!resp.ok) {
      const text = await resp.text();
      if (resp.status === 400 || resp.status === 401) {
        await admin.from("user_oauth_tokens").update({
          needs_reauth: true,
          reauth_reason: text.slice(0, 200),
          reauth_flagged_at: new Date().toISOString(),
        }).eq("id", row.id);
      }
      await logEdgeError({
        functionName: "finalize-invoice", level: "error",
        message: `Refresh token Google falhou (${resp.status})`,
        userId, tenantId,
        httpStatus: resp.status,
        metadata: {
          run_id: runId, email: row.email, response: text.slice(0, 500),
          hint: text.includes("invalid_grant")
            ? "invalid_grant: refresh token revogado pelo user ou expirado"
            : undefined,
        },
      });
      return null;
    }
    const tokens = await resp.json();
    const newAccess = tokens.access_token as string;
    const expiresIn = (tokens.expires_in as number) || 3600;
    await admin.from("user_oauth_tokens").update({
      access_token: newAccess,
      token_expiry: new Date(Date.now() + expiresIn * 1000).toISOString(),
      needs_reauth: false,
      reauth_reason: null,
      reauth_flagged_at: null,
    }).eq("id", row.id);
    return newAccess;
  } catch (e) {
    await logEdgeError({
      functionName: "finalize-invoice", level: "error",
      message: "Excepção no refresh Google",
      error: e, userId, tenantId,
      metadata: { run_id: runId },
    });
    return null;
  }
}

async function findDuplicate(
  admin: SupabaseAdmin,
  invoice: InvoiceRow,
  normalizedSupplier: string | null,
): Promise<string | null> {
  // Doc number — match exacto dentro do tenant+company
  if (invoice.doc_number && invoice.company_id) {
    const { data } = await admin.from("invoices")
      .select("id, doc_number")
      .eq("tenant_id", invoice.tenant_id)
      .eq("company_id", invoice.company_id)
      .ilike("doc_number", invoice.doc_number)
      .is("deleted_at", null)
      .neq("id", invoice.id)
      .limit(1);
    if (data && data.length > 0) return (data[0].id as string);
  }
  // Fallback: supplier + data + total
  if (normalizedSupplier && invoice.doc_date && invoice.montant_ttc !== null && invoice.company_id) {
    const { data } = await admin.from("invoices")
      .select("id")
      .eq("tenant_id", invoice.tenant_id)
      .eq("company_id", invoice.company_id)
      .ilike("supplier_name", normalizedSupplier)
      .eq("doc_date", invoice.doc_date)
      .eq("montant_ttc", invoice.montant_ttc)
      .is("deleted_at", null)
      .neq("id", invoice.id)
      .limit(1);
    if (data && data.length > 0) return (data[0].id as string);
  }
  return null;
}

function detectCompany(
  companies: CompanyRow[],
  destinataireName: string | null,
  currentCompanyId: string | null,
): string | null {
  if (destinataireName) {
    const d = destinataireName.toLowerCase();
    const match = companies.find((c) => {
      const nm = c.name.toLowerCase();
      const sn = (c.short_name ?? "").toLowerCase();
      return (nm && d.includes(nm)) || (sn && d.includes(sn));
    });
    if (match) return match.id;
  }
  if (currentCompanyId && companies.some((c) => c.id === currentCompanyId)) return currentCompanyId;
  // Default: is_default, ou primeira
  return companies[0]?.id ?? null;
}

async function matchOrCreateSupplier(
  admin: SupabaseAdmin,
  tenantId: string,
  supplierName: string,
  supplierNif: string | null,
  existing: Array<{ id: string; name: string }>,
): Promise<string | null> {
  const match = existing.find((s) => s.name.toUpperCase() === supplierName.toUpperCase());
  if (match) return match.id;
  const { data } = await admin.from("suppliers").insert({
    tenant_id: tenantId,
    name: supplierName,
    display_name: supplierName,
    nif: supplierNif,
  }).select("id").single();
  return (data as { id: string } | null)?.id ?? null;
}

function buildFolderPath(
  structure: string,
  root: string,
  companyName: string,
  year: number,
  monthLabel: string,
  costTypeLabel: string,
  supplierName: string,
): string[] {
  switch (structure) {
    case "year_type":
      return [root, companyName, String(year), costTypeLabel || "Outros"];
    case "year_supplier":
      return [root, companyName, String(year), supplierName || "OUTROS"];
    case "year_month":
    default:
      return [root, companyName, String(year), monthLabel];
  }
}

async function markReason(admin: SupabaseAdmin, invoiceId: string, reason: string) {
  await admin.from("invoices").update({
    status: "review",
    manual_review: true,
    review_reason: reason.slice(0, 500),
  }).eq("id", invoiceId);
}

async function logAndReview(
  admin: SupabaseAdmin,
  invoiceId: string,
  runId: string,
  tenantId: string,
  stage: string,
  err: unknown,
) {
  const msg = errString(err);
  await logEdgeError({
    functionName: "finalize-invoice",
    level: "error",
    message: `Falha em ${stage}: ${msg.slice(0, 200)}`,
    error: err,
    tenantId,
    metadata: { run_id: runId, invoice_id: invoiceId, stage },
  });
  await markReason(admin, invoiceId, `${stage}: ${msg.slice(0, 400)}`);
}

function errString(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  try { return JSON.stringify(e); } catch { return "unknown"; }
}
