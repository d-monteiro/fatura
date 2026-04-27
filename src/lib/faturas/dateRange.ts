// Mapeia os filtros de data da página Faturas para um intervalo [start, end] em YYYY-MM-DD.
// Precedência: intervalo explícito (dateStart/dateEnd) > ano+mês > ano.
// `month` requer `year` no UI (dropdown desabilitado), logo mês sem ano não é tratado.

interface Input {
  year: string;
  month: string;
  dateStart: string;
  dateEnd: string;
}

export interface DateRange {
  start: string | null;
  end: string | null;
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

function lastDayOfMonth(year: number, month: number): string {
  const d = new Date(Date.UTC(year, month, 0));
  return `${year}-${pad2(month)}-${pad2(d.getUTCDate())}`;
}

export function computeDateRange(f: Input): DateRange {
  if (f.dateStart || f.dateEnd) {
    return { start: f.dateStart || null, end: f.dateEnd || null };
  }

  const year = f.year ? parseInt(f.year, 10) : null;
  const month = f.month ? parseInt(f.month, 10) : null;

  if (year && month) {
    return { start: `${year}-${pad2(month)}-01`, end: lastDayOfMonth(year, month) };
  }
  if (year) {
    return { start: `${year}-01-01`, end: `${year}-12-31` };
  }
  return { start: null, end: null };
}
