export const SCOPE_DRIVE = 'https://www.googleapis.com/auth/drive.file';
export const SCOPE_SHEETS = 'https://www.googleapis.com/auth/spreadsheets';
export const SCOPE_GMAIL_READ = 'https://www.googleapis.com/auth/gmail.readonly';

export const FULL_SCOPES: readonly string[] = [
  'email',
  'profile',
  SCOPE_DRIVE,
  SCOPE_SHEETS,
  SCOPE_GMAIL_READ,
];

export function hasStorageScopes(scopes: string[] | null | undefined): boolean {
  return !!scopes?.includes(SCOPE_DRIVE);
}

export function hasGmailScopes(scopes: string[] | null | undefined): boolean {
  return !!scopes?.includes(SCOPE_GMAIL_READ);
}
