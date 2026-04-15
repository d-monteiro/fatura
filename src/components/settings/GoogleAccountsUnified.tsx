import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { Globe, Trash2, Plus, Star, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { useTenant } from '@/contexts/TenantContext';
import { redirectToGoogleOAuth } from '@/lib/google/oauth';
import { hasStorageScopes, hasGmailScopes, SCOPE_SHEETS } from '@/lib/google/scopes';
import { queryKeys } from '@/lib/queryKeys';
import type { OAuthToken, Company, EmailAccount } from '@/types/database';

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
        .select('*, email_accounts(id, company_id, is_active, companies(name))')
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
  });

  const deleteToken = useMutation({
    mutationFn: async (tokenId: string) => {
      await supabase.from('user_oauth_tokens').delete().eq('id', tokenId);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.oauthTokens }),
  });

  const setPrimary = useMutation({
    mutationFn: async (tokenId: string) => {
      await supabase.from('user_oauth_tokens')
        .update({ is_primary_storage: false })
        .eq('user_id', userId);
      await supabase.from('user_oauth_tokens')
        .update({ is_primary_storage: true })
        .eq('id', tokenId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.oauthTokens });
      toast.success('Conta definida como armazenamento principal');
    },
  });

  const linkToCompany = useMutation({
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
      toast.success('Conta ligada à empresa');
      setLinkState(null);
      setTargetCompany('');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addAccount = () => {
    redirectToGoogleOAuth({ userId, source: 'settings', promptSelect: true });
  };

  return (
    <div className="border border-border rounded-xl p-6">
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
              <li key={t.id} className="p-3 bg-muted rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium truncate">{t.email}</p>
                      {t.is_primary_storage && (
                        <span className="inline-flex items-center gap-0.5 text-xs px-2 py-0.5 bg-amber-50 text-amber-700 rounded">
                          <Star className="h-3 w-3" /> Principal
                        </span>
                      )}
                      {storage && <Badge>Drive</Badge>}
                      {sheets && <Badge>Sheets</Badge>}
                      {gmail && <Badge>Gmail</Badge>}
                    </div>
                    {linkedCompanies.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Faturas de:{' '}
                        {linkedCompanies
                          .map((e) => e.companies?.name ?? '—')
                          .join(', ')}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    {!t.is_primary_storage && storage && (
                      <button
                        onClick={() => setPrimary.mutate(t.id)}
                        className="text-xs text-primary hover:underline px-2 py-1"
                        title="Definir como armazenamento principal"
                      >
                        <Star className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      onClick={() => deleteToken.mutate(t.id)}
                      className="text-destructive hover:opacity-70 p-2"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                {gmail && availableCompanies.length > 0 && (
                  <div className="mt-2 flex items-center gap-2">
                    {linkState?.tokenId === t.id ? (
                      <>
                        <select
                          value={targetCompany}
                          onChange={(e) => setTargetCompany(e.target.value)}
                          className="flex-1 text-sm px-2 py-1 border border-border rounded bg-background"
                        >
                          <option value="">Escolher empresa...</option>
                          {availableCompanies.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
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
                          className="text-xs px-3 py-1 bg-primary text-primary-foreground rounded disabled:opacity-50"
                        >
                          Ligar
                        </button>
                        <button
                          onClick={() => { setLinkState(null); setTargetCompany(''); }}
                          className="text-xs px-2 py-1 text-muted-foreground"
                        >
                          Cancelar
                        </button>
                      </>
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

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded">{children}</span>
  );
}
