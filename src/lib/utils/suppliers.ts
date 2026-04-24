// Mapping vem de tenant.suppliers (variantes registadas por cliente).
export interface KnownSupplier {
  normalized: string;
  variations: string[];
}

export function normalizeSupplierName(
  name: string | null,
  knownSuppliers: KnownSupplier[] = [],
): string | null {
  if (!name) return null;
  const upper = name.toUpperCase().trim();
  for (const s of knownSuppliers) {
    const norm = s.normalized.toUpperCase();
    if (upper.includes(norm)) return s.normalized;
    for (const v of s.variations) {
      if (upper.includes(v.toUpperCase())) return s.normalized;
    }
  }
  return upper;
}
