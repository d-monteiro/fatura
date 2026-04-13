import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { Mail, Trash2, Plus } from 'lucide-react';
import { useState } from 'react';

export function EmailAccounts({ userId }: { userId: string }) {
  const { tenant } = useTenant();
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [selectedCompany, setSelectedCompany] = useState('');
  const [selectedToken, setSelectedToken] = useState('');

  const { data: accounts = [] } = useQuery({
    queryKey: ['email-accounts', userId],
    queryFn: async () => {
      const { data } = await supabase
        .from('email_accounts')
        .select('*, companies(name)')
        .eq('user_id', userId)
        .eq('is_active', true);
      return data || [];
    },
    enabled: !!userId,
  });

  const { data: companies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: async () => {
      const { data } = await supabase.from('companies').select('id, name').eq('is_active', true);
      return data || [];
    },
  });

  const { data: tokens = [] } = useQuery({
    queryKey: ['oauth-tokens', userId],
    queryFn: async () => {
      const { data } = await supabase.from('user_oauth_tokens').select('id, email').eq('user_id', userId);
      return data || [];
    },
    enabled: !!userId,
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      await supabase.from('email_accounts').insert({
        ...(tenant?.id ? { tenant_id: tenant.id } : {}),
        user_id: userId,
        email: newEmail,
        company_id: selectedCompany || null,
        oauth_token_id: selectedToken || null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['email-accounts'] });
      setShowAdd(false);
      setNewEmail('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('email_accounts').update({ is_active: false }).eq('id', id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['email-accounts'] }),
  });

  return (
    <div className="border border-border rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Mail size={20} />
          Comptes email (sync automatique)
        </h2>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 text-sm"
        >
          <Plus size={16} /> Ajouter
        </button>
      </div>

      {showAdd && (
        <div className="mb-4 p-4 bg-muted rounded-lg space-y-3">
          <input
            type="email"
            placeholder="adresse@gmail.com"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            className="w-full px-3 py-2 border border-border rounded-lg bg-background"
          />
          <div className="flex gap-3">
            <select
              value={selectedCompany}
              onChange={(e) => setSelectedCompany(e.target.value)}
              className="flex-1 px-3 py-2 border border-border rounded-lg bg-background"
            >
              <option value="">Entreprise par défaut...</option>
              {companies.map((c: any) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <select
              value={selectedToken}
              onChange={(e) => setSelectedToken(e.target.value)}
              className="flex-1 px-3 py-2 border border-border rounded-lg bg-background"
            >
              <option value="">Compte Google associé...</option>
              {tokens.map((t: any) => (
                <option key={t.id} value={t.id}>{t.email}</option>
              ))}
            </select>
          </div>
          <button
            onClick={() => addMutation.mutate()}
            disabled={!newEmail}
            className="px-4 py-2 bg-accent text-accent-foreground rounded-lg hover:opacity-90 text-sm disabled:opacity-50"
          >
            Enregistrer
          </button>
        </div>
      )}

      {accounts.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Aucun compte email configuré. Ajoutez les comptes Gmail pour la synchronisation automatique des factures (23h58 chaque jour).
        </p>
      ) : (
        <div className="space-y-3">
          {accounts.map((acc: any) => (
            <div key={acc.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <div>
                <p className="font-medium">{acc.email}</p>
                <div className="flex gap-2 mt-1">
                  <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded">
                    {(acc as any).companies?.name || 'Pas d\'entreprise'}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {acc.last_sync_at ? `Dernier sync: ${new Date(acc.last_sync_at).toLocaleDateString('fr-FR')}` : 'Jamais synchronisé'}
                  </span>
                </div>
              </div>
              <button onClick={() => deleteMutation.mutate(acc.id)} className="text-destructive hover:opacity-70 p-2">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
