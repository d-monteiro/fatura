// Janela temporal dos relatórios automáticos.
// Suporta daily/weekly/monthly/quarterly com send_day + send_hour por config.
//
// `computeWindowFor` recebe frequency + send_day (DOW para weekly, DOM para
// monthly/quarterly) + send_hour + instante UTC + timezone IANA do tenant e
// devolve a janela do período anterior + se é o momento natural de disparar.

export type PeriodKind = "daily" | "weekly" | "monthly" | "quarterly";

export interface PeriodWindow {
  periodStart: string;
  periodEnd: string;
  shouldSendNow: boolean;
  localHour: number;
  localDow: number;
  localDom: number;
}

const DOW_MAP: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function pad2(n: number): string { return String(n).padStart(2, "0"); }

function dateToIso(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d) + days * 86_400_000);
  return dateToIso(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
}

export function periodKindLengthDays(kind: PeriodKind): number {
  switch (kind) {
    case "daily": return 1;
    case "weekly": return 7;
    case "monthly": return 30;
    case "quarterly": return 90;
  }
}

function lastDayOfMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

interface LocalParts { year: number; month: number; day: number; hour: number; dow: number; }

function localParts(nowUtc: Date, timezone: string): LocalParts {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", weekday: "short", hour12: false,
  });
  const parts = fmt.formatToParts(nowUtc);
  const pick = (t: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === t)?.value ?? "";
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

function quarterStartMonth(month: number): number {
  return Math.floor((month - 1) / 3) * 3 + 1;
}

export function computeWindowFor(
  kind: PeriodKind,
  sendDay: number,
  sendHour: number,
  nowUtc: Date,
  timezone: string,
): PeriodWindow {
  const { year, month, day, hour, dow } = localParts(nowUtc, timezone);
  const today = dateToIso(year, month, day);

  if (kind === "daily") {
    const periodStart = addDaysIso(today, -1);
    const periodEnd = addDaysIso(today, -1);
    return {
      periodStart, periodEnd,
      shouldSendNow: hour === sendHour,
      localHour: hour, localDow: dow, localDom: day,
    };
  }

  if (kind === "weekly") {
    // sendDay 0..6 (0=Dom). Janela = última semana ISO (segunda a domingo).
    const mondayOffset = (dow + 6) % 7;
    const periodStart = addDaysIso(today, -(mondayOffset + 7));
    const periodEnd = addDaysIso(today, -(mondayOffset + 1));
    return {
      periodStart, periodEnd,
      shouldSendNow: dow === sendDay && hour === sendHour,
      localHour: hour, localDow: dow, localDom: day,
    };
  }

  if (kind === "monthly") {
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const periodStart = dateToIso(prevYear, prevMonth, 1);
    const periodEnd = dateToIso(prevYear, prevMonth, lastDayOfMonth(prevYear, prevMonth));
    // Em meses curtos, capa o sendDay ao último dia do mês actual.
    const cappedDay = Math.min(sendDay, lastDayOfMonth(year, month));
    return {
      periodStart, periodEnd,
      shouldSendNow: day === cappedDay && hour === sendHour,
      localHour: hour, localDow: dow, localDom: day,
    };
  }

  // quarterly: período = trimestre anterior. Envia no sendDay do primeiro mês do trimestre actual.
  const currentQuarterStart = quarterStartMonth(month);
  const prevQuarterStartMonth = currentQuarterStart === 1 ? 10 : currentQuarterStart - 3;
  const prevQuarterYear = currentQuarterStart === 1 ? year - 1 : year;
  const prevQuarterEndMonth = prevQuarterStartMonth + 2;
  const periodStart = dateToIso(prevQuarterYear, prevQuarterStartMonth, 1);
  const periodEnd = dateToIso(prevQuarterYear, prevQuarterEndMonth, lastDayOfMonth(prevQuarterYear, prevQuarterEndMonth));
  const isFirstMonthOfQuarter = month === currentQuarterStart;
  const cappedDay = Math.min(sendDay, lastDayOfMonth(year, month));
  return {
    periodStart, periodEnd,
    shouldSendNow: isFirstMonthOfQuarter && day === cappedDay && hour === sendHour,
    localHour: hour, localDow: dow, localDom: day,
  };
}

// Backwards-compat: legacy callers que ainda usam shapes antigas do plano (weekly=Mon@8, monthly=1@8).
export function computeWindow(
  kind: "weekly" | "monthly",
  nowUtc: Date,
  timezone: string,
): PeriodWindow {
  const sendDay = kind === "weekly" ? 1 : 1;
  return computeWindowFor(kind, sendDay, 8, nowUtc, timezone);
}

export function computePreviousWindow(
  kind: PeriodKind,
  periodStart: string,
): { start: string; end: string } {
  if (kind === "daily") {
    return { start: addDaysIso(periodStart, -1), end: addDaysIso(periodStart, -1) };
  }
  if (kind === "weekly") {
    return { start: addDaysIso(periodStart, -7), end: addDaysIso(periodStart, -1) };
  }
  if (kind === "monthly") {
    const [y, m] = periodStart.split("-").map(Number);
    const prevMonth = m === 1 ? 12 : m - 1;
    const prevYear = m === 1 ? y - 1 : y;
    return {
      start: dateToIso(prevYear, prevMonth, 1),
      end: dateToIso(prevYear, prevMonth, lastDayOfMonth(prevYear, prevMonth)),
    };
  }
  // quarterly: trimestre anterior
  const [y, m] = periodStart.split("-").map(Number);
  const prevQuarterStart = m - 3 < 1 ? m + 9 : m - 3;
  const prevQuarterYear = m - 3 < 1 ? y - 1 : y;
  const prevEndMonth = prevQuarterStart + 2;
  return {
    start: dateToIso(prevQuarterYear, prevQuarterStart, 1),
    end: dateToIso(prevQuarterYear, prevEndMonth, lastDayOfMonth(prevQuarterYear, prevEndMonth)),
  };
}

export function formatDatePt(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
