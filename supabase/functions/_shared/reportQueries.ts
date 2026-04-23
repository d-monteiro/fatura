// Agregação de faturas para os relatórios automáticos.
//
// Traz todas as linhas do período num único SELECT e reduz em memória.
// Escala para milhares de faturas por tenant sem custo adicional de BD.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

const MAX_ROWS = 10_000;

interface InvoiceRow {
  supplier_name: string | null;
  cost_type: string | null;
  metier: string | null;
  montant_ht: number | null;
  montant_tva: number | null;
  montant_ttc: number | null;
  status: string | null;
  manual_review: boolean | null;
}

export interface PeriodKpis {
  invoicesCount: number;
  totalHt: number;
  totalTva: number;
  totalTtc: number;
  pendingCount: number;
  manualReviewCount: number;
}

export interface SupplierRow {
  name: string;
  invoicesCount: number;
  totalTtc: number;
}

export interface BreakdownRow {
  label: string;
  totalTtc: number;
}

export interface ReportData {
  kpis: PeriodKpis;
  topSuppliers: SupplierRow[];
  costTypeBreakdown: BreakdownRow[];
  metierBreakdown: BreakdownRow[];
}

async function fetchInvoiceRows(
  sb: SupabaseClient,
  tenantId: string,
  periodStart: string,
  periodEnd: string,
): Promise<InvoiceRow[]> {
  const { data, error } = await sb
    .from("invoices")
    .select("supplier_name, cost_type, metier, montant_ht, montant_tva, montant_ttc, status, manual_review")
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .gte("doc_date", periodStart)
    .lte("doc_date", periodEnd)
    .limit(MAX_ROWS);
  if (error) throw new Error(`invoices_fetch: ${error.message}`);
  return (data ?? []) as InvoiceRow[];
}

function num(v: number | null | undefined): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function aggregateKpis(rows: InvoiceRow[]): PeriodKpis {
  let totalHt = 0, totalTva = 0, totalTtc = 0, pendingCount = 0, manualReviewCount = 0;
  for (const r of rows) {
    totalHt += num(r.montant_ht);
    totalTva += num(r.montant_tva);
    totalTtc += num(r.montant_ttc);
    if (r.status === "pending") pendingCount++;
    if (r.manual_review === true) manualReviewCount++;
  }
  return {
    invoicesCount: rows.length,
    totalHt: round2(totalHt),
    totalTva: round2(totalTva),
    totalTtc: round2(totalTtc),
    pendingCount,
    manualReviewCount,
  };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function topSuppliersOf(rows: InvoiceRow[], limit: number): SupplierRow[] {
  const map = new Map<string, { count: number; total: number }>();
  for (const r of rows) {
    const name = (r.supplier_name ?? "").trim();
    if (!name) continue;
    const entry = map.get(name) ?? { count: 0, total: 0 };
    entry.count++;
    entry.total += num(r.montant_ttc);
    map.set(name, entry);
  }
  return [...map.entries()]
    .map(([name, v]) => ({ name, invoicesCount: v.count, totalTtc: round2(v.total) }))
    .sort((a, b) => b.totalTtc - a.totalTtc)
    .slice(0, limit);
}

function breakdownBy(rows: InvoiceRow[], key: "cost_type" | "metier"): BreakdownRow[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    const label = (r[key] ?? "").trim();
    if (!label) continue;
    map.set(label, (map.get(label) ?? 0) + num(r.montant_ttc));
  }
  return [...map.entries()]
    .map(([label, total]) => ({ label, totalTtc: round2(total) }))
    .sort((a, b) => b.totalTtc - a.totalTtc);
}

export async function fetchReportData(
  sb: SupabaseClient,
  tenantId: string,
  periodStart: string,
  periodEnd: string,
): Promise<ReportData> {
  const rows = await fetchInvoiceRows(sb, tenantId, periodStart, periodEnd);
  return {
    kpis: aggregateKpis(rows),
    topSuppliers: topSuppliersOf(rows, 5),
    costTypeBreakdown: breakdownBy(rows, "cost_type"),
    metierBreakdown: breakdownBy(rows, "metier"),
  };
}

export async function fetchPreviousTotalTtc(
  sb: SupabaseClient,
  tenantId: string,
  prevStart: string,
  prevEnd: string,
): Promise<number> {
  const { data, error } = await sb
    .from("invoices")
    .select("montant_ttc")
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .gte("doc_date", prevStart)
    .lte("doc_date", prevEnd)
    .limit(MAX_ROWS);
  if (error) throw new Error(`previous_total_fetch: ${error.message}`);
  const total = (data ?? []).reduce((acc: number, r: { montant_ttc: number | null }) => acc + num(r.montant_ttc), 0);
  return round2(total);
}
