import {
  SECTORS,
  EU_COUNTRIES,
  DOCUMENT_TYPES,
  FOLDER_TEMPLATES,
  CURRENCIES,
} from '@/components/onboarding/onboardingTypes';

function labelOf<T extends { value: string; label: string }>(list: readonly T[], value: string | null | undefined): string {
  if (!value) return '—';
  return list.find((x) => x.value === value)?.label ?? value;
}

export const sectorLabel = (v: string | null | undefined) => labelOf(SECTORS, v);
export const countryLabel = (v: string | null | undefined) => labelOf(EU_COUNTRIES, v);
export const documentTypeLabel = (v: string) => labelOf(DOCUMENT_TYPES, v);
export const folderStructureLabel = (v: string | null | undefined) => labelOf(FOLDER_TEMPLATES, v);
export const currencyLabel = (v: string | null | undefined) => labelOf(CURRENCIES, v);

export const AUTO_REPORTS_LABEL: Record<string, string> = {
  never: 'Nunca',
  weekly: 'Semanal',
  monthly: 'Mensal',
};

export const STORAGE_PROVIDER_LABEL: Record<string, string> = {
  google_drive: 'Google Drive',
  onedrive: 'OneDrive',
};

export const BILLING_CYCLE_LABEL: Record<string, string> = {
  monthly: 'Mensal',
  yearly: 'Anual',
};
