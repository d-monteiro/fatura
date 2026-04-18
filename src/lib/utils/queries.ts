// Escape caracteres LIKE (% e _) para evitar filter bypass em searches.
export function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (m) => `\\${m}`);
}
