// Formatação PT-PT consolidada. `cents` em inteiro (ex.: 4990 → "49,90 EUR";
// 49000 → "490 EUR"; 12345600 → "123 456 EUR"). NULL devolve null.

export function formatEur(cents: number | null): string | null {
  if (cents === null) return null;
  const euros = cents / 100;
  const hasFraction = cents % 100 !== 0;
  const formatted = new Intl.NumberFormat("pt-PT", {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(euros);
  return `${formatted} EUR`;
}
