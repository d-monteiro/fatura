const VALID_IVA_RATES = [0, 6, 13, 23];
const IVA_TOLERANCE = 0.02;

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
