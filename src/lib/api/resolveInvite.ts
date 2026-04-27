import { supabase } from '@/lib/supabase/client';

export type InviteStatus = 'pending' | 'expired' | 'revoked' | 'accepted' | 'not_found';

export interface InviteMetadata {
  status: 'pending';
  email: string;
  role: 'member' | 'readonly';
  expires_at: string;
  tenant_name: string;
  tenant_logo_url: string | null;
  tenant_primary_color: string;
  inviter_email: string | null;
}

export interface InviteUnavailable {
  status: Exclude<InviteStatus, 'pending'>;
}

export type ResolveResult = InviteMetadata | InviteUnavailable;

export async function resolveInvite(token: string): Promise<ResolveResult> {
  const { data, error } = await supabase.functions.invoke<ResolveResult>('resolve-invite', {
    body: { token },
  });
  if (error) {
    // 410 Gone (expired/revoked/accepted) → Supabase trata como erro com body legível
    const ctx = (error as { context?: Response }).context;
    if (ctx instanceof Response) {
      try {
        const body = await ctx.json() as { status?: InviteStatus };
        if (body.status) return { status: body.status as Exclude<InviteStatus, 'pending'> };
      } catch { /* ignored */ }
    }
    throw error;
  }
  if (!data) throw new Error('Resposta vazia do servidor');
  return data;
}
