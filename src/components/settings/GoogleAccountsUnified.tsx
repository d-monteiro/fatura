import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { Globe, Trash2, Plus, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { useTenant } from '@/contexts/TenantContext';
import { redirectToGoogleOAuth } from '@/lib/google/oauth';
import { hasStorageScopes, hasGmailScopes, SCOPE_SHEETS } from '@/lib/google/scopes';
import { queryKeys } from '@/lib/queryKeys';
import type { OAuthToken, Company, EmailAccount } from '@/types/database';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type TokenWithEmails = OAuthToken & {
  email_accounts: (Pick<EmailAccount, 'id' | 'company_id' | 'is_active'> & {
    companies: { name: string } | null;
  })[];
};

export function GoogleAccountsUnified({ userId }: { userId: string }) {
  const { tenant } = useTenant();
  const qc = useQueryClient();
  const [linkState, setLinkState] = useState<{ tokenId: string; email: string } | null>(null);
  const [targetCompany, setTargetCompany] = useState('');

  const { data: tokens = [], isLoading } = useQuery<TokenWithEmails[]>({
    queryKey: [...queryKeys.oauthTokens, userId],
    queryFn: async () => {
      const { data } = await supabase
        .from('user_oauth_tokens')
        .select('id, provider, email, scopes, is_primary_storage, token_expiry, tenant_id, user_id, email_accounts(id, company_id, is_active, companies(name))')
        .eq('user_id', userId)
        .eq('provider', 'google')
        .order('is_primary_storage', { ascending: false });
      return (data as TokenWithEmails[] | null) ?? [];
    },
    enabled: !!userId,
  });

  const { data: companies = [] } = useQuery<Pick<Company, 'id' | 'name'>[]>({
    queryKey: queryKeys.companies,
    queryFn: async () => {
      const { data } = await supabase
        .from('companies').select('id, name').eq('is_active', true);
      return (data as Pick<Company, 'id' | 'name'>[] | null) ?? [];
    },
    enabled: !!tenant?.id,
  });

  const deleteToken = useMutation({
    mutationKey: ['google-token-revoke'],
    mutationFn: async (tokenId: string) => {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const { data: { session } } = await supabase.auth.getSession();
      if (!supabaseUrl || !session) throw new Error('Sessão em falta');
      const resp = await fetch(`${supabaseUrl}/functions/v1/revoke-oauth-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ token_id: tokenId }),
      });
      if (!resp.ok) {
        const detail = await resp.text();
        throw new Error(`Falha a revogar: ${detail.slice(0, 160)}`);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.oauthTokens });
      qc.invalidateQueries({ queryKey: queryKeys.emailAccounts });
      qc.invalidateQueries({ queryKey: queryKeys.companies });
      toast.success('Conta Google desligada e revogada');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const linkToCompany = useMutation({
    mutationKey: ['google-link-company'],
    mutationFn: async ({ tokenId, email, companyId }: { tokenId: string; email: string; companyId: string }) => {
      if (!tenant?.id) throw new Error('Sem tenant activo');
      const { data: existing } = await supabase
        .from('email_accounts').select('id')
        .eq('tenant_id', tenant.id)
        .eq('email', email)
        .eq('company_id', companyId)
        .maybeSingle();
      if (existing) {
        await supabase.from('email_accounts')
          .update({ oauth_token_id: tokenId, is_active: true })
          .eq('id', existing.id);
      } else {
        await supabase.from('email_accounts').insert({
          tenant_id: tenant.id,
          user_id: userId,
          company_id: companyId,
          oauth_token_id: tokenId,
          email,
          provider: 'gmail',
          is_active: true,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.oauthTokens });
      qc.invalidateQueries({ queryKey: queryKeys.emailAccounts });
      qc.invalidateQueries({ queryKey: queryKeys.companies });
      toast.success('Conta ligada à empresa');
      setLinkState(null);
      setTargetCompany('');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addAccount = () => {
    void redirectToGoogleOAuth({ source: 'settings', promptSelect: true })
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : 'Falha ao iniciar OAuth'));
  };

  return (
    <div id="google-accounts" className="border border-border rounded-xl p-6 scroll-mt-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Globe size={20} />
          Contas Google ligadas
        </h2>
        <button
          onClick={addAccount}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 text-sm"
        >
          <Plus size={16} /> Adicionar conta
        </button>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">A carregar...</p>
      ) : tokens.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Ainda não ligaste nenhuma conta Google. Adiciona uma conta para ativar Drive, Sheets e sincronização de Gmail.
        </p>
      ) : (
        <ul className="space-y-3">
          {tokens.map((t) => {
            const storage = hasStorageScopes(t.scopes);
            const gmail = hasGmailScopes(t.scopes);
            const sheets = t.scopes?.includes(SCOPE_SHEETS);
            const linkedCompanies = t.email_accounts?.filter((e) => e.is_active) ?? [];
            const availableCompanies = companies.filter(
              (c) => !linkedCompanies.some((l) => l.company_id === c.id),
            );
            return (
              <li key={t.id} className="rounded-lg border border-border bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium truncate flex-1 min-w-0">{t.email}</p>
                  <button
                    onClick={() => deleteToken.mutate(t.id)}
                    className="shrink-0 -mr-1 p-1 text-muted-foreground hover:text-destructive transition"
                    title="Remover conta"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                {linkedCompanies.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">
                      Faturas de
                    </p>
                    <p className="text-lg font-semibold text-foreground mt-0.5">
                      {linkedCompanies
                        .map((e) => e.companies?.name ?? '—')
                        .join(', ')}
                    </p>
                  </div>
                )}

                <div className="mt-3">
                  <p className="text-xs text-muted-foreground mb-1.5">Com permissões em:</p>
                  <div className="flex flex-wrap gap-1.5">
                    <PermissionBadge active={storage}>Drive</PermissionBadge>
                    <PermissionBadge active={!!sheets}>Sheets</PermissionBadge>
                    <PermissionBadge active={gmail}>Gmail</PermissionBadge>
                  </div>
                </div>

                {gmail && availableCompanies.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-border">
                    {linkState?.tokenId === t.id ? (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <Select value={targetCompany} onValueChange={setTargetCompany}>
                            <SelectTrigger size="sm"><SelectValue placeholder="Escolher empresa..." /></SelectTrigger>
                            <SelectContent>
                              {availableCompanies.map((c) => (
                                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <button
                          onClick={() => {
                            if (!targetCompany || !t.email) return;
                            linkToCompany.mutate({
                              tokenId: t.id,
                              email: t.email,
                              companyId: targetCompany,
                            });
                          }}
                          disabled={!targetCompany}
                          className="shrink-0 text-xs px-3 py-2 bg-primary text-primary-foreground rounded-md disabled:opacity-50"
                        >
                          Ligar
                        </button>
                        <button
                          onClick={() => { setLinkState(null); setTargetCompany(''); }}
                          className="shrink-0 text-xs px-2 py-2 text-muted-foreground"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setLinkState({ tokenId: t.id, email: t.email ?? '' })}
                        className="text-xs text-primary hover:underline flex items-center gap-1"
                      >
                        <Mail className="h-3 w-3" /> Receber faturas numa empresa…
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function PermissionBadge({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <span
      className={
        active
          ? 'inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700'
          : 'inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-400 line-through'
      }
      title={active ? 'Permissão concedida' : 'Permissão em falta — reautentica a conta'}
    >
      {children}
    </span>
  );
}
