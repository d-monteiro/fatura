import { isValidNifPT } from './nif';

const VALID_IVA_RATES = [0, 6, 13, 23]; // PT: isento/reduzido/intermédio/normal
const IVA_TOLERANCE = 0.02; // EUR — margem para arredondamentos do emissor

// Re-export como façade — preferir importar isValidNifPT directamente.
export { isValidNifPT as isValidNif };

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
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('pt-PT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
}
