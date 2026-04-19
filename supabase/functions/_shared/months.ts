const MONTHS: Record<string, string[]> = {
  pt: ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'],
  en: ['January','February','March','April','May','June','July','August','September','October','November','December'],
};

export function getMonthName(monthIndex: number, language = 'pt'): string {
  const arr = MONTHS[language] ?? MONTHS.pt;
  return arr[monthIndex] ?? arr[0];
}

export function formatMonthFolder(monthIndex: number, language = 'pt'): string {
  return `${String(monthIndex + 1).padStart(2, '0')} - ${getMonthName(monthIndex, language)}`;
}
