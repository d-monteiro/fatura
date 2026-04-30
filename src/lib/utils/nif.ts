// NIF PT — helper único para normalização, validação e classificação.
// Usado em ingestão (Gemini), edição (formulários), import (SAF-T), backfill.
// Algoritmo do dígito de controlo: módulo 11 sobre os primeiros 8 dígitos com
// pesos 9..2; se o resultado >= 10, o controlo é 0.

export type NifKindPT = 'singular' | 'colectiva' | 'outro' | 'invalido';

// Strip de "PT", espaços e qualquer caracter não numérico. Devolve string com
// 9 dígitos, ou null se não houver 9 dígitos depois da limpeza.
export function normalizeNifPT(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/[^\d]/g, '');
  return digits.length === 9 ? digits : null;
}

export function isValidNifPT(raw: string | null | undefined): boolean {
  const nif = normalizeNifPT(raw);
  if (!nif) return false;
  let sum = 0;
  for (let i = 0; i < 8; i++) sum += parseInt(nif[i], 10) * (9 - i);
  const mod = sum % 11;
  const expected = mod < 2 ? 0 : 11 - mod;
  return expected === parseInt(nif[8], 10);
}

// Tipo do contribuinte pelo primeiro dígito (categorias da AT em PT).
// 1/2/3 → singular (particulares e profissionais liberais).
// 5 → colectiva (sociedades, principais fornecedores B2B).
// 6/7/8/9 → entidades especiais (administração, herdeiros, condóminos, etc.).
// 4 não é atribuído. Tudo o resto é "outro".
export function nifKindPT(raw: string | null | undefined): NifKindPT {
  const nif = normalizeNifPT(raw);
  if (!nif || !isValidNifPT(nif)) return 'invalido';
  const first = nif[0];
  if (first === '1' || first === '2' || first === '3') return 'singular';
  if (first === '5') return 'colectiva';
  if (first === '6' || first === '7' || first === '8' || first === '9') return 'outro';
  return 'invalido';
}

// "123 456 789" para mostrar bonito em listas/UI. Se inválido, devolve raw.
export function formatNifMaskPT(raw: string | null | undefined): string {
  const nif = normalizeNifPT(raw);
  if (!nif) return raw ?? '';
  return `${nif.slice(0, 3)} ${nif.slice(3, 6)} ${nif.slice(6, 9)}`;
}
