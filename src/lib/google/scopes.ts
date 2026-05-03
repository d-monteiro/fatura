// drive.file cobre Drive + Sheets API (apenas em ficheiros criados pela app —
// o que é o nosso caso, todas as Sheets são criadas via createNewSpreadsheet).
export const SCOPE_DRIVE = 'https://www.googleapis.com/auth/drive.file';
export const SCOPE_GMAIL_READ = 'https://www.googleapis.com/auth/gmail.readonly';

export function hasStorageScopes(scopes: string[] | null | undefined): boolean {
  return !!scopes?.includes(SCOPE_DRIVE);
}

export function hasGmailScopes(scopes: string[] | null | undefined): boolean {
  return !!scopes?.includes(SCOPE_GMAIL_READ);
}
