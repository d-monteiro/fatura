// Edge equivalent of src/lib/utils/queries.ts. Escapa % e _ para que valores
// vindos do Gemini (ex: nomes com underscore) não virem wildcards num ilike.
export function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (m) => `\\${m}`);
}
