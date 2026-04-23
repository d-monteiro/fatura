// Janela temporal dos relatórios automáticos.
//
// `computeWindow` recebe o instante UTC + timezone IANA do tenant e devolve:
//   - periodStart/periodEnd em YYYY-MM-DD (date local, inclusive)
//   - shouldSendNow: se é agora o momento natural de disparar
//
// Weekly → semana ISO anterior (segunda a domingo), envia seg 08h local.
// Monthly → mês anterior completo, envia dia 1 08h local.

export interface PeriodWindow {
  periodStart: string;
  periodEnd: string;
  shouldSendNow: boolean;
  localHour: number;
  localDow: number;       // 0=Sun..6=Sat
  localDom: number;
}

const DOW_MAP: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function dateToIso(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d) + days * 86_400_000);
  return dateToIso(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
}

function lastDayOfMonth(y: number, m: number): number {
  // Truque: dia 0 do mês seguinte = último dia deste mês.
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  dow: number;
}

function localParts(nowUtc: Date, timezone: string): LocalParts {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    weekday: "short",
    hour12: false,
  });
  const parts = fmt.formatToParts(nowUtc);
  const pick = (t: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === t)?.value ?? "";
  // hour12:false ainda pode devolver "24" à meia-noite em alguns runtimes — normalizar.
  const rawHour = pick("hour");
  const hour = parseInt(rawHour === "24" ? "0" : rawHour, 10);
  return {
    year: parseInt(pick("year"), 10),
    month: parseInt(pick("month"), 10),
    day: parseInt(pick("day"), 10),
    hour,
    dow: DOW_MAP[pick("weekday")] ?? 0,
  };
}

export function computeWindow(
  kind: "weekly" | "monthly",
  nowUtc: Date,
  timezone: string,
): PeriodWindow {
  const { year, month, day, hour, dow } = localParts(nowUtc, timezone);
  const today = dateToIso(year, month, day);

  if (kind === "weekly") {
    // Offset da segunda desta semana ISO (segunda=0, ..., domingo=6).
    const mondayOffset = (dow + 6) % 7;
    const periodStart = addDaysIso(today, -(mondayOffset + 7));
    const periodEnd = addDaysIso(today, -(mondayOffset + 1));
    return {
      periodStart,
      periodEnd,
      shouldSendNow: dow === 1 && hour === 8,
      localHour: hour,
      localDow: dow,
      localDom: day,
    };
  }

  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const periodStart = dateToIso(prevYear, prevMonth, 1);
  const periodEnd = dateToIso(prevYear, prevMonth, lastDayOfMonth(prevYear, prevMonth));
  return {
    periodStart,
    periodEnd,
    shouldSendNow: day === 1 && hour === 8,
    localHour: hour,
    localDow: dow,
    localDom: day,
  };
}

export function computePreviousWindow(
  kind: "weekly" | "monthly",
  periodStart: string,
): { start: string; end: string } {
  if (kind === "weekly") {
    return {
      start: addDaysIso(periodStart, -7),
      end: addDaysIso(periodStart, -1),
    };
  }
  const [y, m] = periodStart.split("-").map(Number);
  const prevMonth = m === 1 ? 12 : m - 1;
  const prevYear = m === 1 ? y - 1 : y;
  return {
    start: dateToIso(prevYear, prevMonth, 1),
    end: dateToIso(prevYear, prevMonth, lastDayOfMonth(prevYear, prevMonth)),
  };
}

export function formatDatePt(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
