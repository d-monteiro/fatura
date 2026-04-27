import { supabase } from '@/lib/supabase/client';

export interface InviteMemberInput {
  tenantId: string;
  email: string;
  role: 'member' | 'readonly';
}

export interface InviteMemberResult {
  invite_id: string;
  token: string;
  expires_at: string;
  invite_url: string;
  email: string;
  role: 'member' | 'readonly';
}

export interface InviteMemberError extends Error {
  status: number;
  seatsUsed?: number;
  seatsMax?: number;
}

export async function inviteMember(input: InviteMemberInput): Promise<InviteMemberResult> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    const e = new Error('Sessão expirada — entra novamente.') as InviteMemberError;
    e.status = 401;
    throw e;
  }

  const { data, error } = await supabase.functions.invoke<InviteMemberResult & {
    error?: string; seats_used?: number; seats_max?: number;
  }>('invite-member', {
    body: {
      tenant_id: input.tenantId,
      email: input.email,
      role: input.role,
    },
  });

  if (error) {
    // FunctionsHttpError carrega o status, mas não o body — refazemos parse via context.
    const status = (error as { context?: { status?: number } }).context?.status ?? 500;
    let serverMessage = error.message;
    let seatsUsed: number | undefined;
    let seatsMax: number | undefined;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx instanceof Response) {
        const body = await ctx.json() as { error?: string; seats_used?: number; seats_max?: number };
        if (body.error) serverMessage = body.error;
        seatsUsed = body.seats_used;
        seatsMax = body.seats_max;
      }
    } catch { /* ignored */ }
    const e = new Error(serverMessage) as InviteMemberError;
    e.status = status;
    e.seatsUsed = seatsUsed;
    e.seatsMax = seatsMax;
    throw e;
  }

  if (!data || !data.invite_id) {
    const e = new Error(data?.error ?? 'Resposta inválida') as InviteMemberError;
    e.status = 500;
    throw e;
  }

  return data;
}
