import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { Mail, Plug } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTenant } from '@/contexts/TenantContext';
import { queryKeys } from '@/lib/queryKeys';
import { hasGmailScopes } from '@/lib/google/scopes';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type GmailToken = { id: string; email: string | null; token_expiry: string | null; scopes: string[] | null };
type LinkedAccount = { id: string; email: string; oauth_token_id: string; user_oauth_tokens: { token_expiry: string | null; refresh_token: string | null } | null };

// Contas Gmail ligadas a uma empresa — sync de faturas por caixa de correio.
export function CompanyEmailAccounts({ companyId }: { companyId: string }) {
  const { user } = useAuth();
  const { tenant } = useTenant();
  const qc = useQueryClient();
  const [pickToken, setPickToken] = useState('');

  const { data: linked = [] } = useQuery<LinkedAccount[]>({
    queryKey: [...queryKeys.emailAccounts, companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from('email_accounts')
        .select('id, email, oauth_token_id, user_oauth_tokens!oauth_token_id(token_expiry, refresh_token)')
        .eq('company_id', companyId)
        .eq('is_active', true);
      return (data as LinkedAccount[] | null) ?? [];
    },
    enabled: !!tenant?.id,
  });

  const { data: tokens = [] } = useQuery<GmailToken[]>({
    queryKey: [...queryKeys.oauthTokens, user?.id, 'gmail'],
    queryFn: async () => {
      const { data } = await supabase
        .from('user_oauth_tokens')
        .select('id, email, token_expiry, scopes')
        .eq('user_id', user!.id)
        .eq('provider', 'google');
      return ((data as GmailToken[] | null) ?? []).filter((tok) => hasGmailScopes(tok.scopes));
    },
    enabled: !!user?.id,
  });

  const link = useMutation({
    mutationFn: async (tokenId: string) => {
      if (!tenant?.id || !user) throw new Error('Sem sessão');
      const tok = tokens.find((x) => x.id === tokenId);
      if (!tok?.email) throw new Error('Conta inválida');
      const { error: insErr } = await supabase.from('email_accounts').insert({
        tenant_id: tenant.id, user_id: user.id, company_id: companyId,
        oauth_token_id: tokenId, email: tok.email, provider: 'gmail', is_active: true,
      });
      if (insErr) throw insErr;
    },
    onSuccess: () => {
      toast.success('Conta ligada');
      setPickToken('');
      qc.invalidateQueries({ queryKey: queryKeys.emailAccounts });
      qc.invalidateQueries({ queryKey: queryKeys.oauthTokens });
      qc.invalidateQueries({ queryKey: queryKeys.companies });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const unlink = useMutation({
    mutationFn: async (accountId: string) => {
      const { error: dbErr } = await supabase.from('email_accounts').update({ is_active: false }).eq('id', accountId);
      if (dbErr) throw dbErr;
    },
    onSuccess: () => {
      toast.success('Conta desligada');
      qc.invalidateQueries({ queryKey: queryKeys.emailAccounts });
      qc.invalidateQueries({ queryKey: queryKeys.oauthTokens });
    },
  });

  const linkedIds = new Set(linked.map((l) => l.oauth_token_id));
  const available = tokens.filter((tok) => !linkedIds.has(tok.id));

  return (
    <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
      {linked.map((acc) => {
        const ok = !!acc.user_oauth_tokens?.refresh_token;
        return (
          <div key={acc.id} className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <Mail className="h-4 w-4 text-gray-400 shrink-0" />
              <span className="text-sm text-gray-700 truncate">{acc.email}</span>
              <span className={`h-2 w-2 rounded-full shrink-0 ${ok ? 'bg-green-500' : 'bg-red-400'}`} title={ok ? 'Conta ativa' : 'Conta revogada — voltar a ligar'} />
            </div>
            <button onClick={() => unlink.mutate(acc.id)} className="text-xs text-gray-400 hover:text-red-500 shrink-0 ml-2">Desligar</button>
          </div>
        );
      })}

      {available.length > 0 ? (
        <div className="flex items-center gap-2">
          <Plug className="h-4 w-4 text-gray-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <Select value={pickToken} onValueChange={setPickToken}>
              <SelectTrigger size="sm"><SelectValue placeholder="Ligar conta Google…" /></SelectTrigger>
              <SelectContent>
                {available.map((tok) => (
                  <SelectItem key={tok.id} value={tok.id}>{tok.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <button onClick={() => pickToken && link.mutate(pickToken)} disabled={!pickToken || link.isPending} className="shrink-0 text-xs px-3 py-2 bg-primary text-primary-foreground rounded-md disabled:opacity-50">Ligar</button>
        </div>
      ) : linked.length === 0 ? (
        <p className="text-xs text-gray-500">
          Sem contas Google disponíveis. <a href="#google-accounts" className="text-primary hover:underline">Adiciona uma conta acima</a>.
        </p>
      ) : null}
    </div>
  );
}
