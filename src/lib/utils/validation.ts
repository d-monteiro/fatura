const VALID_IVA_RATES = [0, 6, 13, 23]; // PT: isento/reduzido/intermédio/normal
const IVA_TOLERANCE = 0.02; // EUR — margem para arredondamentos do emissor

// NIF PT: 9 dígitos, último é checksum módulo 11.
export function isValidNif(nif: string | null): boolean {
  if (!nif) return false;
  const clean = nif.replace(/\s/g, '');
  if (!/^\d{9}$/.test(clean)) return false;
  let sum = 0;
  for (let i = 0; i < 8; i++) sum += parseInt(clean[i]) * (9 - i);
  const check = 11 - (sum % 11);
  const expected = check >= 10 ? 0 : check;
  return expected === parseInt(clean[8]);
}

// Valida coerência líquido + IVA = bruto dentro de IVA_TOLERANCE.
export function validateMontants(
  ht: number | null,
  iva: number | null,
  ttc: number | null,
  ivaRate: number | null,
): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (ht === null || ttc === null) {
    return { valid: false, errors: ['Valor sem IVA ou com IVA em falta'], warnings };
  }

  if (ivaRate !== null && !VALID_IVA_RATES.includes(ivaRate)) {
    warnings.push(`Taxa de IVA invulgar: ${ivaRate}%`);
  }

  if (iva !== null) {
    const expectedTTC = ht + iva;
    if (Math.abs(expectedTTC - ttc) > IVA_TOLERANCE) {
      errors.push(`Sem IVA (${ht}) + IVA (${iva}) = ${expectedTTC.toFixed(2)}, mas total = ${ttc}`);
    }
  }

  if (ivaRate !== null && iva !== null && ht > 0) {
    const expectedIva = ht * (ivaRate / 100);
    if (Math.abs(expectedIva - iva) > IVA_TOLERANCE) {
      warnings.push(`Valor de IVA (${iva}) não corresponde à taxa ${ivaRate}% sobre ${ht}`);
    }
  }

  if (iva === 0 && ivaRate === 0) {
    warnings.push('IVA a 0% — verificar se há autoliquidação');
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function formatEUR(value: number | null): string {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' });
}

export function formatDatePT(dateStr: string | null): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('pt-PT', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}
