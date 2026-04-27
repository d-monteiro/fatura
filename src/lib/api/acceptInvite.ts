import { supabase } from '@/lib/supabase/client';

export interface AcceptInviteResult {
  tenant_id: string;
  role: 'member' | 'readonly';
  already_accepted: boolean;
}

export type AcceptInviteFailureCode =
  | 'invite_not_found'
  | 'invite_revoked'
  | 'invite_expired'
  | 'invite_already_accepted'
  | 'invite_email_mismatch'
  | 'not_authenticated'
  | 'unknown';

export class AcceptInviteError extends Error {
  code: AcceptInviteFailureCode;
  constructor(code: AcceptInviteFailureCode, message: string) {
    super(message);
    this.code = code;
  }
}

function inferCode(error: { code?: string; details?: string | null; message?: string }): AcceptInviteFailureCode {
  if (error.code === '42501') return 'not_authenticated';
  if (error.code === 'P0002') return 'invite_not_found';
  const detail = error.details ?? '';
  if (detail.includes('invite_revoked')) return 'invite_revoked';
  if (detail.includes('invite_expired')) return 'invite_expired';
  if (detail.includes('invite_email_mismatch')) return 'invite_email_mismatch';
  if (detail.includes('invite_already_accepted')) return 'invite_already_accepted';
  return 'unknown';
}

export async function acceptInvite(token: string): Promise<AcceptInviteResult> {
  const { data, error } = await supabase.rpc('accept_invite', { p_token: token });
  if (error) {
    const code = inferCode(error as { code?: string; details?: string | null; message?: string });
    throw new AcceptInviteError(code, error.message);
  }
  return data as AcceptInviteResult;
}
