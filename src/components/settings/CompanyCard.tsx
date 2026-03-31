import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { Pencil, Check, X, Mail, LogIn, Star } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { useAuth } from '@/contexts/AuthContext';
import type { Company } from '@/types/database';

interface CompanyCardProps {
  company: Company & { token_expiry?: string | null; refresh_token?: string | null };
}

export function CompanyCard({ company: c }: CompanyCardProps) {
  const { t } = useI18n();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', siret: '', tva_intracom: '', address: '' });
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: async () => {
      const siretClean = form.siret.replace(/\s/g, '');
      if (siretClean && !/^\d{14}$/.test(siretClean)) throw new Error(t('sup.siret_invalid'));
      const { error: dbErr } = await supabase.from('companies').update({
        name: form.name || undefined, siret: siretClean || null,
        tva_intracom: form.tva_intracom || null, address: form.address || null,
      }).eq('id', c.id);
      if (dbErr) throw dbErr;
    },
    onSuccess: () => { setEditing(false); setError(''); queryClient.invalidateQueries({ queryKey: ['companies'] }); },
    onError: (e: Error) => setError(e.message),
  });

  const startEdit = () => {
    setEditing(true); setError('');
    setForm({ name: c.name, siret: c.siret ?? '', tva_intracom: c.tva_intracom ?? '', address: c.address ?? '' });
  };

  const handleConnectGmail = () => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    if (!clientId || !supabaseUrl || !user) return;

    // Gmail scopes commented out until Google OAuth verification approved
    const scopes = [
      'email', 'profile',
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/spreadsheets',
      // 'https://www.googleapis.com/auth/gmail.readonly',
      // 'https://www.googleapis.com/auth/gmail.modify',
    ].join(' ');

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', `${supabaseUrl}/functions/v1/oauth-callback`);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', scopes);
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');
    authUrl.searchParams.set('state', JSON.stringify({ user_id: user.id, company_id: c.id }));
    if (c.email) authUrl.searchParams.set('login_hint', c.email);

    window.location.href = authUrl.toString();
  };

  const handleDisconnect = async () => {
    await supabase.from('companies').update({ email: null, oauth_token_id: null }).eq('id', c.id);
    queryClient.invalidateQueries({ queryKey: ['companies'] });
  };

  const inputCls = 'w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20';
  const update = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const hasToken = !!c.oauth_token_id;
  const tokenOk = hasToken && c.token_expiry && new Date(c.token_expiry) > new Date();

  if (editing) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-card space-y-2">
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="grid grid-cols-2 gap-2">
          <div><label className="block text-xs font-medium text-gray-500 mb-0.5">{t('company.name')}</label><input className={inputCls} value={form.name} onChange={(e) => update('name', e.target.value)} /></div>
          <div><label className="block text-xs font-medium text-gray-500 mb-0.5">{t('company.siret')}</label><input className={`${inputCls} font-mono`} value={form.siret} onChange={(e) => update('siret', e.target.value)} /></div>
          <div><label className="block text-xs font-medium text-gray-500 mb-0.5">{t('company.tva_intracom')}</label><input className={`${inputCls} font-mono`} value={form.tva_intracom} onChange={(e) => update('tva_intracom', e.target.value)} /></div>
          <div><label className="block text-xs font-medium text-gray-500 mb-0.5">{t('company.address')}</label><input className={inputCls} value={form.address} onChange={(e) => update('address', e.target.value)} /></div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => mutation.mutate()} disabled={mutation.isPending} className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1 text-xs font-medium text-white shadow-sm hover:opacity-90 disabled:opacity-50"><Check className="h-3.5 w-3.5" />{t('action.save')}</button>
          <button onClick={() => { setEditing(false); setError(''); }} className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"><X className="h-3.5 w-3.5" />{t('action.cancel')}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-card">
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-gray-900">{c.name}</p>
            <span className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded-full font-medium">{c.short_name}</span>
            {c.is_default && <span className="inline-flex items-center gap-0.5 text-xs px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full font-medium"><Star className="h-3 w-3" />{t('company.default')}</span>}
          </div>
          <p className="mt-1 text-xs text-gray-500">
            {c.siret ? `SIRET: ${c.siret}` : ''}{c.tva_intracom ? ` | TVA: ${c.tva_intracom}` : ''}
          </p>
          {c.address && <p className="text-xs text-gray-400 mt-0.5">{c.address}</p>}
        </div>
        <button onClick={startEdit} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600" title={t('sup.edit')}>
          <Pencil className="h-4 w-4" />
        </button>
      </div>

      {/* Email section */}
      <div className="mt-3 pt-3 border-t border-gray-100">
        {c.email ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <Mail className="h-4 w-4 text-gray-400 shrink-0" />
              <span className="text-sm text-gray-700 truncate">{c.email}</span>
              <span className={`h-2 w-2 rounded-full shrink-0 ${tokenOk ? 'bg-green-500' : 'bg-red-400'}`} />
            </div>
            <div className="flex items-center gap-1 shrink-0 ml-2">
              {!tokenOk && <button onClick={handleConnectGmail} className="text-xs text-primary hover:underline">{t('auto.reauth')}</button>}
              <button onClick={handleDisconnect} className="text-xs text-gray-400 hover:text-red-500 ml-1">{t('company.disconnect_gmail')}</button>
            </div>
          </div>
        ) : (
          <button onClick={handleConnectGmail} className="inline-flex items-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-500 hover:border-primary hover:text-primary transition-colors w-full justify-center">
            <LogIn className="h-4 w-4" />
            {t('company.connect_gmail')}
          </button>
        )}
      </div>
    </div>
  );
}
