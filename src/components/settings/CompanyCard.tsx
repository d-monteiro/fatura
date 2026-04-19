import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { Pencil, Check, X, Mail, Trash2, Plug } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { useAuth } from '@/contexts/AuthContext';
import { useTenant } from '@/contexts/TenantContext';
import type { Company } from '@/types/database';
import { queryKeys } from '@/lib/queryKeys';
import { hasGmailScopes } from '@/lib/google/scopes';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface CompanyCardProps {
  company: Company;
}

type GmailToken = { id: string; email: string | null; token_expiry: string | null; scopes: string[] | null };
type LinkedAccount = { id: string; email: string; oauth_token_id: string; user_oauth_tokens: { token_expiry: string | null; refresh_token: string | null } | null };

export function CompanyCard({ company: c }: CompanyCardProps) {
  const { t } = useI18n();
  const { user } = useAuth();
  const { tenant } = useTenant();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', nif: '', address: '' });
  const [error, setError] = useState('');
  const [pickToken, setPickToken] = useState('');

  const { data: linked = [] } = useQuery<LinkedAccount[]>({
    queryKey: [...queryKeys.emailAccounts, c.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('email_accounts')
        .select('id, email, oauth_token_id, user_oauth_tokens!oauth_token_id(token_expiry, refresh_token)')
        .eq('company_id', c.id)
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

  const update = useMutation({
    mutationFn: async () => {
      const nifClean = form.nif.replace(/\s/g, '');
      const { error: dbErr } = await supabase.from('companies').update({
        name: form.name || undefined, nif: nifClean || null, address: form.address || null,
      }).eq('id', c.id);
      if (dbErr) throw dbErr;
    },
    onSuccess: () => { setEditing(false); setError(''); qc.invalidateQueries({ queryKey: queryKeys.companies }); },
    onError: (e: Error) => setError(e.message),
  });

  const del = useMutation({
    mutationFn: async () => {
      const { error: dbErr } = await supabase.from('companies').update({ is_active: false }).eq('id', c.id);
      if (dbErr) throw dbErr;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.companies }),
  });

  const link = useMutation({
    mutationFn: async (tokenId: string) => {
      if (!tenant?.id || !user) throw new Error('Sem sessão');
      const tok = tokens.find((x) => x.id === tokenId);
      if (!tok?.email) throw new Error('Conta inválida');
      const { error: insErr } = await supabase.from('email_accounts').insert({
        tenant_id: tenant.id, user_id: user.id, company_id: c.id,
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

  if (editing) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-card space-y-3">
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor={`c-${c.id}-name`}>{t('company.name')}</Label>
            <Input id={`c-${c.id}-name`} value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`c-${c.id}-nif`}>{t('company.nif')}</Label>
            <Input id={`c-${c.id}-nif`} className="font-mono" value={form.nif} onChange={(e) => setForm((p) => ({ ...p, nif: e.target.value }))} />
          </div>
          <div className="col-span-2 space-y-1">
            <Label htmlFor={`c-${c.id}-addr`}>{t('company.address')}</Label>
            <Input id={`c-${c.id}-addr`} value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} />
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => update.mutate()} disabled={update.isPending} className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"><Check className="h-3.5 w-3.5" />{t('action.save')}</button>
          <button onClick={() => { setEditing(false); setError(''); }} className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"><X className="h-3.5 w-3.5" />{t('action.cancel')}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-card">
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-900">{c.name}</p>
          {c.nif && <p className="mt-1 text-xs text-gray-500">NIF: {c.nif}</p>}
          {c.address && <p className="mt-0.5 text-xs text-gray-400">{c.address}</p>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => { setEditing(true); setError(''); setForm({ name: c.name, nif: c.nif ?? '', address: c.address ?? '' }); }} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600" title={t('sup.edit')}><Pencil className="h-4 w-4" /></button>
          <button onClick={() => { if (confirm(`Eliminar "${c.name}"?`)) del.mutate(); }} className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600" title={t('action.delete')}><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>

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
    </div>
  );
}
