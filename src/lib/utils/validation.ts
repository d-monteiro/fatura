/**
 * FaturaAI - Validations françaises
 * SIRET/SIREN Luhn, TVA, format numérique FR
 */

const VALID_TVA_RATES = [0, 2.1, 5.5, 10, 20];
const TVA_TOLERANCE = 0.02; // EUR

/** Luhn check (SIREN 9 digits, SIRET 14 digits) */
function luhnCheck(num: string): boolean {
  let sum = 0;
  for (let i = 0; i < num.length; i++) {
    let digit = parseInt(num[num.length - 1 - i]);
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

export function isValidSiren(siren: string | null): boolean {
  if (!siren) return false;
  const clean = siren.replace(/\s/g, '');
  if (!/^\d{9}$/.test(clean)) return false;
  return luhnCheck(clean);
}

export function isValidSiret(siret: string | null): boolean {
  if (!siret) return false;
  const clean = siret.replace(/\s/g, '');
  if (!/^\d{14}$/.test(clean)) return false;
  if (!isValidSiren(clean.substring(0, 9))) return false;
  return luhnCheck(clean);
}

/** Validate HT + TVA = TTC */
export function validateMontants(
  ht: number | null,
  tva: number | null,
  ttc: number | null,
  tauxTva: number | null
): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (ht === null || ttc === null) {
    return { valid: false, errors: ['Montant HT ou TTC manquant'], warnings };
  }

  // Check TVA rate
  if (tauxTva !== null && !VALID_TVA_RATES.includes(tauxTva)) {
    warnings.push(`Taux TVA inhabituel: ${tauxTva}%`);
  }

  // Check HT + TVA = TTC
  if (tva !== null) {
    const expectedTTC = ht + tva;
    if (Math.abs(expectedTTC - ttc) > TVA_TOLERANCE) {
      errors.push(`HT (${ht}) + TVA (${tva}) = ${expectedTTC.toFixed(2)}, mais TTC = ${ttc}`);
    }
  }

  // Check TVA matches rate
  if (tauxTva !== null && tva !== null && ht > 0) {
    const expectedTVA = ht * (tauxTva / 100);
    if (Math.abs(expectedTVA - tva) > TVA_TOLERANCE) {
      warnings.push(`Montant TVA (${tva}) ne correspond pas au taux ${tauxTva}% de HT (${ht})`);
    }
  }

  // Autoliquidation check
  if (tva === 0 && tauxTva === 0) {
    warnings.push('TVA à 0% — vérifier si autoliquidation (sous-traitant)');
  }

  return { valid: errors.length === 0, errors, warnings };
}

/** Parse French number format: "1 234,56" -> 1234.56 */
export function parseFrenchNumber(value: string | null): number | null {
  if (!value) return null;
  const cleaned = value
    .replace(/\s/g, '')       // Remove spaces (thousands)
    .replace(/\./g, '')       // Remove dots (thousands alt)
    .replace(',', '.');       // Comma -> decimal point
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/** Format number to French display: 1234.56 -> "1 234,56" */
export function formatFrenchNumber(value: number | null, decimals = 2): string {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString('fr-FR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Format EUR: 1234.56 -> "1 234,56 €" */
export function formatEUR(value: number | null): string {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString('fr-FR', {
    style: 'currency',
    currency: 'EUR',
  });
}

/** Format date to FR: "2026-03-15" -> "15/03/2026" */
export function formatDateFR(dateStr: string | null): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return dateStr;
  }
}
