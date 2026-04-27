// Agregação de faturas para os relatórios automáticos.
//
// Traz todas as linhas do período num único SELECT e reduz em memória.
// Escala para milhares de faturas por tenant sem custo adicional de BD.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

const MAX_ROWS = 10_000;

interface InvoiceRow {
  supplier_name: string | null;
  category: string | null;
  valor_sem_iva: number | null;
  valor_iva: number | null;
  valor_total: number | null;
  status: string | null;
  manual_review: boolean | null;
}

export interface PeriodKpis {
  invoicesCount: number;
  totalNet: number;
  totalIva: number;
  totalGross: number;
  pendingCount: number;
  manualReviewCount: number;
}

export interface SupplierRow {
  name: string;
  invoicesCount: number;
  totalGross: number;
}

export interface BreakdownRow {
  label: string;
  totalGross: number;
}

export interface ReportData {
  kpis: PeriodKpis;
  topSuppliers: SupplierRow[];
  categoryBreakdown: BreakdownRow[];
}

async function fetchInvoiceRows(
  sb: SupabaseClient,
  tenantId: string,
  periodStart: string,
  periodEnd: string,
): Promise<InvoiceRow[]> {
  const { data, error } = await sb
    .from("invoices")
    .select("supplier_name, category, valor_sem_iva, valor_iva, valor_total, status, manual_review")
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
  let totalNet = 0, totalIva = 0, totalGross = 0, pendingCount = 0, manualReviewCount = 0;
  for (const r of rows) {
    totalNet += num(r.valor_sem_iva);
    totalIva += num(r.valor_iva);
    totalGross += num(r.valor_total);
    if (r.status === "pending") pendingCount++;
    if (r.manual_review === true) manualReviewCount++;
  }
  return {
    invoicesCount: rows.length,
    totalNet: round2(totalNet),
    totalIva: round2(totalIva),
    totalGross: round2(totalGross),
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
    entry.total += num(r.valor_total);
    map.set(name, entry);
  }
  return [...map.entries()]
    .map(([name, v]) => ({ name, invoicesCount: v.count, totalGross: round2(v.total) }))
    .sort((a, b) => b.totalGross - a.totalGross)
    .slice(0, limit);
}

function breakdownByCategory(rows: InvoiceRow[]): BreakdownRow[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    const label = (r.category ?? "").trim();
    if (!label) continue;
    map.set(label, (map.get(label) ?? 0) + num(r.valor_total));
  }
  return [...map.entries()]
    .map(([label, total]) => ({ label, totalGross: round2(total) }))
    .sort((a, b) => b.totalGross - a.totalGross);
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
    categoryBreakdown: breakdownByCategory(rows),
  };
}

export async function fetchPreviousTotalGross(
  sb: SupabaseClient,
  tenantId: string,
  prevStart: string,
  prevEnd: string,
): Promise<number> {
  const { data, error } = await sb
    .from("invoices")
    .select("valor_total")
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .gte("doc_date", prevStart)
    .lte("doc_date", prevEnd)
    .limit(MAX_ROWS);
  if (error) throw new Error(`previous_total_fetch: ${error.message}`);
  const total = (data ?? []).reduce((acc: number, r: { valor_total: number | null }) => acc + num(r.valor_total), 0);
  return round2(total);
}
