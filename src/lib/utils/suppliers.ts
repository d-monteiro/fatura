/**
 * Normalização de fornecedores baseada em config do tenant.
 * O mapping vem de tenant.suppliers (variantes registadas) ou onboarding_data.topSuppliers.
 */

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
