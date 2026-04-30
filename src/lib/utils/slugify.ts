// Slug PT-friendly: lower + sem acentos + colapsa espaços/símbolos para "_".
// "Combining Diacritical Marks" U+0300-U+036F são os caracteres invisíveis
// que sobram depois de normalize('NFD'). Construímos a regex via
// String.raw para que o ficheiro não dependa de encoding UTF-8 nos invisíveis.
const COMBINING_MARKS = new RegExp(`[̀-ͯ]`, 'g');

export function slugify(s: string, fallback = 'cat'): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '') || fallback;
}
