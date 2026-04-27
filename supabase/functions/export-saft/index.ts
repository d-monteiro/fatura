// ============================================
// Edge Function: export-saft
// Gera SAF-T (PT) + ZIP com PDFs + XLSX resumo para uma empresa (company_id)
// num dado período. Devolve signed URL do Storage (1h).
//
// Auth: JWT do user. Valida membership no tenant, plano Pro/Enterprise,
// e que a empresa pertence ao tenant. O NIF SAF-T é o de companies.nif
// (por-empresa, nunca tenant-wide) — respeita a granularidade multi-empresa.
// ============================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import JSZip from "npm:jszip@3.10.1";
import * as XLSX from "npm:xlsx@0.18.5";
import { getCorsHeaders } from "../_shared/cors.ts";
import { logEdgeError } from "../_shared/logError.ts";
import {
  buildSaftXml, inferInvoiceType,
  type SaftInvoice, type SaftLine, type SaftSupplier,
} from "../_shared/saft/builder.ts";
import {
  downloadDriveFile, ensureFreshAccessToken, extensionFromMime, getPrimaryDriveToken,
} from "../_shared/saft/driveFetch.ts";

const ALLOWED_PLANS = ["pro", "entreprise"];
const SIGNED_URL_TTL = 3600;

function json(status: number, body: unknown, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}

// Slug seguro para filename: remove acentos, troca não-alfanumérico por _,
// limita a 30 chars e tira underscores extremos.
function slugify(s: string): string {
  return s
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 30) || "Empresa";
}

// Detecta se [start, end] cobre exactamente um mês civil (1..último dia).
function isFullMonth(start: string, end: string): boolean {
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  if (sy !== ey || sm !== em || sd !== 1) return false;
  const lastDay = new Date(Date.UTC(ey, em, 0)).getUTCDate();
  return ed === lastDay;
}

function periodLabel(start: string, end: string): string {
  if (isFullMonth(start, end)) return start.slice(0, 7); // "AAAA-MM"
  return `${start.replace(/-/g, "")}-${end.replace(/-/g, "")}`;
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" }, corsHeaders);

  const runId = crypto.randomUUID();
  const t0 = Date.now();

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json(401, { error: "Unauthorized" }, corsHeaders);

  let body: { tenant_id?: string; company_id?: string; period_start?: string; period_end?: string };
  try { body = await req.json(); } catch { return json(400, { error: "Invalid JSON" }, corsHeaders); }

  const tenantId = body.tenant_id;
  const companyId = body.company_id;
  const periodStart = body.period_start;
  const periodEnd = body.period_end;
  if (!tenantId || !companyId || !periodStart || !periodEnd) {
    return json(400, { error: "Missing tenant_id, company_id, period_start or period_end" }, corsHeaders);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd)) {
    return json(400, { error: "Invalid date format" }, corsHeaders);
  }
  if (periodEnd < periodStart) {
    return json(400, { error: "period_end must be >= period_start" }, corsHeaders);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json(401, { error: "Unauthorized" }, corsHeaders);

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // 1) Verificar membership + plano.
  const { data: membership } = await admin.from("tenant_users")
    .select("tenant_id, role, is_active")
    .eq("user_id", user.id).eq("tenant_id", tenantId).eq("is_active", true).maybeSingle();
  if (!membership) return json(403, { error: "Não és membro deste tenant." }, corsHeaders);

  const { data: tenant } = await admin.from("tenants")
    .select("id, name, currency, plan_id, plans(slug)")
    .eq("id", tenantId).maybeSingle();
  type TenantRowWithPlan = {
    id: string; name: string; currency: string | null; plan_id: string | null;
    plans: { slug: string } | Array<{ slug: string }> | null;
  };
  const tenantRow = tenant as TenantRowWithPlan | null;
  const planRel = tenantRow?.plans;
  const planSlug = (Array.isArray(planRel) ? planRel[0]?.slug : planRel?.slug) ?? "";
  if (!ALLOWED_PLANS.includes(planSlug)) {
    return json(402, { error: "Export SAF-T disponível no plano Pro ou Empresarial." }, corsHeaders);
  }

  // 2) Carregar empresa e validar tenant.
  const { data: company, error: cErr } = await admin.from("companies")
    .select("id, tenant_id, name, short_name, nif, address")
    .eq("id", companyId).eq("tenant_id", tenantId).maybeSingle();
  if (cErr || !company) return json(404, { error: "Empresa não encontrada" }, corsHeaders);
  if (!company.nif || !/^\d{9}$/.test(company.nif)) {
    return json(400, { error: "A empresa não tem NIF válido — preenche no ecrã de definições antes de exportar." }, corsHeaders);
  }

  // 3) Carregar faturas do período + linhas + fornecedores.
  const { data: invoices, error: iErr } = await admin.from("invoices")
    .select("id, doc_number, doc_date, document_type, supplier_id, supplier_name, supplier_nif, valor_sem_iva, valor_iva, valor_total, taxa_iva, autoliquidacao, storage_path, drive_file_id")
    .eq("tenant_id", tenantId).eq("company_id", companyId)
    .is("deleted_at", null)
    .gte("doc_date", periodStart).lte("doc_date", periodEnd)
    .order("doc_date", { ascending: true });
  if (iErr) {
    await logEdgeError({ functionName: "export-saft", level: "error", message: iErr.message, requestId: runId, tenantId });
    return json(500, { error: iErr.message }, corsHeaders);
  }

  if (!invoices || invoices.length === 0) {
    return json(400, { error: "Sem faturas no período seleccionado." }, corsHeaders);
  }

  const invoiceIds = invoices.map((i) => i.id);
  const { data: linesRows } = await admin.from("invoice_line_items")
    .select("invoice_id, line_number, description, quantity, unit, preco_unitario, total_sem_iva, taxa_iva")
    .in("invoice_id", invoiceIds)
    .order("line_number", { ascending: true });

  const linesByInvoice = new Map<string, SaftLine[]>();
  for (const row of linesRows ?? []) {
    const arr = linesByInvoice.get(row.invoice_id) ?? [];
    arr.push({
      lineNumber: row.line_number ?? arr.length + 1,
      description: row.description ?? "Item",
      quantity: Number(row.quantity ?? 1),
      unit: row.unit ?? "UN",
      unitPriceNet: Number(row.preco_unitario ?? 0),
      totalNet: Number(row.total_sem_iva ?? 0),
      ivaRate: Number(row.taxa_iva ?? 0),
    });
    linesByInvoice.set(row.invoice_id, arr);
  }

  // Fornecedores: preferir suppliers table, fallback ao nome embebido na invoice.
  const supplierIdSet = new Set<string>();
  invoices.forEach((inv) => { if (inv.supplier_id) supplierIdSet.add(inv.supplier_id); });

  const supplierMap = new Map<string, SaftSupplier>();
  if (supplierIdSet.size > 0) {
    const { data: suppliers } = await admin.from("suppliers")
      .select("id, name, display_name, nif, address")
      .in("id", [...supplierIdSet]);
    (suppliers ?? []).forEach((s) => {
      supplierMap.set(s.id, {
        id: s.id,
        name: s.display_name ?? s.name,
        nif: s.nif,
        address: s.address,
      });
    });
  }

  // Faturas sem supplier_id: gerar sintético baseado no nome.
  invoices.forEach((inv) => {
    if (!inv.supplier_id) {
      const synthId = `NONAME-${(inv.supplier_name ?? "desconhecido").toUpperCase().replace(/[^A-Z0-9]/g, "_").slice(0, 24)}`;
      if (!supplierMap.has(synthId)) {
        supplierMap.set(synthId, {
          id: synthId,
          name: inv.supplier_name ?? "Desconhecido",
          nif: inv.supplier_nif,
          address: null,
        });
      }
    }
  });

  // 4) Mapear SaftInvoice[].
  const saftInvoices: SaftInvoice[] = invoices.map((inv) => {
    const lines = linesByInvoice.get(inv.id) ?? [];
    const supplierId = inv.supplier_id
      ?? `NONAME-${(inv.supplier_name ?? "desconhecido").toUpperCase().replace(/[^A-Z0-9]/g, "_").slice(0, 24)}`;
    return {
      id: inv.id,
      docNumber: inv.doc_number ?? `S/N-${inv.id.slice(0, 8)}`,
      docDate: inv.doc_date ?? periodStart,
      supplierId,
      invoiceType: inferInvoiceType(inv.document_type),
      amountNet: Number(inv.valor_sem_iva ?? 0),
      amountIva: Number(inv.valor_iva ?? 0),
      amountTotal: Number(inv.valor_total ?? 0),
      ivaRate: inv.taxa_iva != null ? Number(inv.taxa_iva) : null,
      reverseCharge: !!inv.autoliquidacao,
      lines,
    };
  });

  // 5) Construir XML.
  const xml = buildSaftXml({
    company: {
      nif: company.nif,
      name: company.name,
      address: company.address,
      currency: tenantRow?.currency ?? "EUR",
    },
    periodStart, periodEnd,
    suppliers: [...supplierMap.values()],
    invoices: saftInvoices,
  });

  // 6) XLSX resumo (simples).
  const wbData = [
    ["Nº Doc.", "Data", "Fornecedor", "NIF", "Valor s/ IVA", "IVA", "Valor Total"],
    ...invoices.map((inv) => [
      inv.doc_number ?? "",
      inv.doc_date ?? "",
      inv.supplier_name ?? "",
      inv.supplier_nif ?? "",
      Number(inv.valor_sem_iva ?? 0),
      Number(inv.valor_iva ?? 0),
      Number(inv.valor_total ?? 0),
    ]),
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wbData);
  XLSX.utils.book_append_sheet(wb, ws, "Faturas");
  const xlsxBuffer: Uint8Array = XLSX.write(wb, { type: "array", bookType: "xlsx" });

  // 7) Montar ZIP (XML + PDFs + XLSX).
  const zip = new JSZip();
  const saftName = `SAFT-${company.nif}-${periodStart.replace(/-/g, "")}-${periodEnd.replace(/-/g, "")}.xml`;
  zip.file(saftName, xml);
  zip.file("resumo.xlsx", xlsxBuffer);

  // PDFs (best-effort). Tentar Storage Supabase primeiro; se a fatura veio
  // via sync de email, o PDF está no Drive (drive_file_id) e descarregamos
  // de lá com refresh automático do token Google. Falhas individuais não
  // bloqueiam o export.
  const faturasFolder = zip.folder("faturas");
  let pdfsIncluded = 0;
  let driveAccessToken: string | null = null;
  let driveTokenChecked = false;

  async function getDriveToken(): Promise<string | null> {
    if (driveTokenChecked) return driveAccessToken;
    driveTokenChecked = true;
    const tokenRow = await getPrimaryDriveToken(admin, tenantId);
    if (!tokenRow) return null;
    driveAccessToken = await ensureFreshAccessToken(admin, tokenRow);
    return driveAccessToken;
  }

  for (const inv of invoices) {
    const safe = (inv.doc_number ?? inv.id.slice(0, 8)).replace(/[^A-Za-z0-9._-]/g, "_");
    let added = false;

    // Tentativa 1: Storage Supabase (uploads manuais e faturas anexadas via UI).
    if (inv.storage_path) {
      try {
        const { data: blob } = await admin.storage.from("invoices").download(inv.storage_path);
        if (blob) {
          const ext = inv.storage_path.split(".").pop() ?? "pdf";
          const bytes = new Uint8Array(await blob.arrayBuffer());
          faturasFolder?.file(`${safe}.${ext}`, bytes);
          pdfsIncluded++;
          added = true;
        }
      } catch (e) {
        console.warn(`[export-saft] storage download failed id=${inv.id}`, e instanceof Error ? e.message : e);
      }
    }

    // Tentativa 2: Google Drive (sync via Gmail + cron).
    if (!added && inv.drive_file_id) {
      const token = await getDriveToken();
      if (!token) {
        console.warn(`[export-saft] sem token Drive para tenant=${tenantId} (faturas em Drive ficam de fora)`);
        continue;
      }
      try {
        const dl = await downloadDriveFile(token, inv.drive_file_id);
        if (dl) {
          const ext = extensionFromMime(dl.mimeType, "pdf");
          faturasFolder?.file(`${safe}.${ext}`, dl.bytes);
          pdfsIncluded++;
        }
      } catch (e) {
        console.warn(`[export-saft] drive download failed id=${inv.id}`, e instanceof Error ? e.message : e);
      }
    }
  }

  const zipBytes = await zip.generateAsync({ type: "uint8array" });

  // 8) Upload + signed URL.
  const storagePath = `${tenantId}/${companyId}/${todayYmd()}-${runId.slice(0, 8)}.zip`;
  const { error: upErr } = await admin.storage.from("saft-exports")
    .upload(storagePath, zipBytes, { contentType: "application/zip", upsert: true });
  if (upErr) {
    await logEdgeError({ functionName: "export-saft", level: "error", message: `upload failed: ${upErr.message}`, requestId: runId, tenantId });
    return json(500, { error: upErr.message }, corsHeaders);
  }

  const { data: signed, error: sErr } = await admin.storage.from("saft-exports")
    .createSignedUrl(storagePath, SIGNED_URL_TTL);
  if (sErr || !signed?.signedUrl) {
    await logEdgeError({ functionName: "export-saft", level: "error", message: `signed url failed: ${sErr?.message}`, requestId: runId, tenantId });
    return json(500, { error: sErr?.message ?? "signed url failed" }, corsHeaders);
  }

  console.log(`[export-saft][${runId}] done in ${Date.now() - t0}ms invoices=${invoices.length} pdfs=${pdfsIncluded}`);

  // Filename amigável: SAFT_<EMPRESA>_<AAAA-MM>.zip para mês inteiro,
  // SAFT_<EMPRESA>_<AAAAMMDD-AAAAMMDD>.zip caso contrário.
  const companySlug = slugify(((company as { short_name?: string | null }).short_name) ?? company.name);
  const filename = `SAFT_${companySlug}_${periodLabel(periodStart, periodEnd)}.zip`;

  return json(200, {
    success: true,
    url: signed.signedUrl,
    filename,
    invoices_count: invoices.length,
    pdfs_included: pdfsIncluded,
    expires_in: SIGNED_URL_TTL,
  }, corsHeaders);
});

export type _AdminClient = SupabaseClient;
