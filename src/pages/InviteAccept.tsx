import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, FileText, CheckCircle2, XCircle, AlertTriangle, LogOut } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase/client';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { OAUTH_PROVIDERS, type OAuthProviderId } from '@/components/common/oauthProviders';
import { translateAuthError } from '@/lib/utils/authErrors';
import { resolveInvite, type InviteMetadata, type ResolveResult } from '@/lib/api/resolveInvite';
import { acceptInvite, AcceptInviteError } from '@/lib/api/acceptInvite';
import { queryKeys } from '@/lib/queryKeys';

type Tab = 'login' | 'signup';

const ROLE_LABEL = { member: 'Membro', readonly: 'Consulta (só leitura)' } as const;
const ROLE_DESC = {
  member: 'Vais poder adicionar/editar faturas, sincronizar emails, gerir fornecedores e categorias.',
  readonly: 'Vais ver e exportar tudo, sem editar — perfeito para o teu contabilista.',
} as const;

function StatusScreen({ icon, title, body, cta }: {
  icon: React.ReactNode; title: string; body: string;
  cta?: { label: string; href?: string; onClick?: () => void; icon?: React.ReactNode };
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-lg">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center">{icon}</div>
        <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
        <p className="mt-2 text-sm text-gray-600">{body}</p>
        {cta && (
          cta.onClick ? (
            <button
              type="button"
              onClick={cta.onClick}
              className="mt-6 inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90"
            >
              {cta.icon}{cta.label}
            </button>
          ) : (
            <a
              href={cta.href ?? '/'}
              className="mt-6 inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90"
            >
              {cta.icon}{cta.label}
            </a>
          )
        )}
      </div>
    </div>
  );
}

export default function InviteAccept() {
  const { token = '' } = useParams<{ token: string }>();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<OAuthProviderId | null>(null);

  const { data: invite, isLoading: inviteLoading, error: inviteError } = useQuery<ResolveResult>({
    queryKey: queryKeys.invite(token),
    enabled: !!token,
    retry: false,
    staleTime: 60_000,
    queryFn: () => resolveInvite(token),
  });

  const pendingInvite = invite?.status === 'pending' ? (invite as InviteMetadata) : null;
  // Email no form: signup é sempre o do convite (read-only); login usa state
  // próprio (default = email do convite, mas user pode mudar).
  const formEmail = tab === 'signup' ? (pendingInvite?.email ?? '') : (email || pendingInvite?.email || '');

  const accept = useMutation({
    mutationFn: () => acceptInvite(token),
    onSuccess: async (res) => {
      try { localStorage.setItem('faturai-current-tenant', res.tenant_id); } catch { /* ignored */ }
      toast.success(res.already_accepted ? 'Já fazias parte desta equipa.' : `Bem-vindo a ${pendingInvite?.tenant_name ?? 'FaturaAI'}.`);
      // Forçar refresh do TenantContext + queries
      await qc.invalidateQueries();
      navigate('/', { replace: true });
    },
    onError: (e: AcceptInviteError) => {
      // Tratado abaixo no render — não pop-toast genérico para ser claro.
      console.error('[invite] accept failed', e.code, e.message);
    },
  });

  // Auto-accept quando user logado + email match + invite pending
  const userEmail = user?.email?.toLowerCase() ?? null;
  const inviteEmail = pendingInvite?.email.toLowerCase() ?? null;
  const emailMatches = !!userEmail && !!inviteEmail && userEmail === inviteEmail;
  const shouldAutoAccept = !!user && !!pendingInvite && emailMatches && !accept.isPending && !accept.isSuccess && !accept.isError;

  useEffect(() => {
    if (shouldAutoAccept) accept.mutate();
  }, [shouldAutoAccept]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- States: loading / invalid / accepting / mismatch / landing ----

  if (authLoading || inviteLoading) {
    return <div className="flex h-screen items-center justify-center"><LoadingSpinner size={40} /></div>;
  }

  if (inviteError) {
    return <StatusScreen
      icon={<XCircle className="h-12 w-12 text-red-500" />}
      title="Não foi possível carregar este convite"
      body="Verifica a tua ligação e tenta de novo. Se o problema persistir, pede ao remetente para gerar um novo link."
      cta={{ label: 'Voltar ao FaturaAI', href: '/' }}
    />;
  }

  if (!invite || invite.status !== 'pending') {
    const status = invite?.status ?? 'not_found';
    const messages: Record<string, { title: string; body: string }> = {
      not_found: { title: 'Convite inválido', body: 'O link parece estar incorrecto ou foi removido. Pede um novo convite ao remetente.' },
      expired: { title: 'Convite expirado', body: 'Este convite passou da data de validade (7 dias). Pede um novo ao remetente.' },
      revoked: { title: 'Convite revogado', body: 'Este convite foi cancelado. Pede um novo ao remetente.' },
      accepted: { title: 'Convite já aceite', body: 'Este convite já foi usado. Faz login para entrar.' },
    };
    const msg = messages[status] ?? messages.not_found;
    return <StatusScreen
      icon={<AlertTriangle className="h-12 w-12 text-amber-500" />}
      title={msg.title}
      body={msg.body}
      cta={status === 'accepted' ? { label: 'Ir para login', href: '/login' } : { label: 'Voltar ao site', href: '/' }}
    />;
  }

  // Invite pending. Se há user mas email não bate certo:
  if (user && !emailMatches) {
    const handleSignOut = async () => {
      await supabase.auth.signOut();
      // Após sign out o useAuth dispara user=null e re-render mostra a landing
    };
    return <StatusScreen
      icon={<AlertTriangle className="h-12 w-12 text-amber-500" />}
      title="Email diferente"
      body={`O convite foi enviado para ${pendingInvite!.email}, mas estás logado como ${user.email}. Sai desta conta e tenta com o email correcto.`}
      cta={{ label: 'Sair desta conta', onClick: handleSignOut, icon: <LogOut className="h-4 w-4" /> }}
    />;
  }

  // Auto-accept em curso ou erro
  if (user && emailMatches) {
    if (accept.isPending) {
      return <StatusScreen
        icon={<Loader2 className="h-12 w-12 animate-spin text-primary" />}
        title="A aceitar convite…"
        body={`A juntar-te a ${pendingInvite!.tenant_name}.`}
      />;
    }
    if (accept.isError) {
      const err = accept.error as AcceptInviteError;
      const msg = err.code === 'invite_email_mismatch'
        ? 'O email do convite não corresponde à tua conta.'
        : err.code === 'invite_expired' ? 'Este convite expirou.'
          : err.code === 'invite_revoked' ? 'Este convite foi revogado.'
            : 'Não foi possível aceitar o convite. Tenta recarregar a página.';
      return <StatusScreen
        icon={<XCircle className="h-12 w-12 text-red-500" />}
        title="Erro a aceitar convite"
        body={msg}
        cta={{ label: 'Voltar ao site', href: '/' }}
      />;
    }
    // success — useMutation onSuccess já navegou
    return <StatusScreen
      icon={<CheckCircle2 className="h-12 w-12 text-green-500" />}
      title="Convite aceite"
      body="A redireccionar…"
    />;
  }

  // Sem user — landing com login/signup/google
  const handleSignIn = async (e: FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: formEmail, password });
    setAuthBusy(false);
    if (error) setAuthError(translateAuthError(error).message);
    // success → AuthContext detecta user → useEffect dispara accept
  };

  const handleSignUp = async (e: FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    if (password.length < 8) {
      setAuthError('A password tem de ter pelo menos 8 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setAuthError('As passwords não coincidem.');
      return;
    }
    setAuthBusy(true);
    const { error } = await supabase.auth.signUp({
      email: pendingInvite!.email,
      password,
      options: { emailRedirectTo: window.location.href },
    });
    setAuthBusy(false);
    if (error) {
      setAuthError(translateAuthError(error).message);
      return;
    }
    toast.success('Conta criada. Se receberes email de confirmação, clica e voltas aqui.');
  };

  const handleOAuth = async (provider: OAuthProviderId) => {
    setAuthError(null);
    setOauthLoading(provider);
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.href },
    });
    if (error) {
      setAuthError(translateAuthError(error).message);
      setOauthLoading(null);
    }
  };

  const inviterText = pendingInvite!.inviter_email
    ? <><strong>{pendingInvite!.inviter_email}</strong> convidou-te</>
    : <>Foste convidado</>;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-10">
      <div className="w-full max-w-md space-y-4">
        {/* Card de identificação do convite */}
        <div className="rounded-2xl bg-white p-6 shadow-card-hover sm:p-7">
          <div className="flex items-center gap-3 border-b border-gray-100 pb-4">
            {pendingInvite!.tenant_logo_url ? (
              <img src={pendingInvite!.tenant_logo_url} alt={pendingInvite!.tenant_name}
                className="h-10 w-10 rounded-lg object-contain bg-gray-50 p-1" />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ background: pendingInvite!.tenant_primary_color }}>
                <FileText className="h-5 w-5 text-white" />
              </div>
            )}
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold text-gray-900">{pendingInvite!.tenant_name}</h1>
              <p className="text-xs text-gray-500">FaturaAI</p>
            </div>
          </div>

          <div className="mt-4 space-y-2 text-sm">
            <p className="text-gray-700">
              {inviterText} para acederes a <strong>{pendingInvite!.tenant_name}</strong> como <strong>{ROLE_LABEL[pendingInvite!.role]}</strong>.
            </p>
            <p className="text-xs text-gray-500">{ROLE_DESC[pendingInvite!.role]}</p>
            <p className="text-xs text-gray-400">
              Convite enviado para <span className="font-mono">{pendingInvite!.email}</span>.
            </p>
          </div>
        </div>

        {/* Auth */}
        <div className="rounded-2xl bg-white p-6 shadow-card-hover sm:p-7 space-y-4">
          {/* OAuth buttons */}
          <div className="grid grid-cols-2 gap-3">
            {OAUTH_PROVIDERS.map(({ id, label, icon: Icon, enabled }) => (
              <button
                key={id}
                type="button"
                onClick={() => enabled && handleOAuth(id)}
                disabled={authBusy || oauthLoading !== null || !enabled}
                title={enabled ? undefined : 'Disponível em breve'}
                className="relative flex h-10 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {oauthLoading === id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon />}
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-gray-200" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">ou com email</span>
            <span className="h-px flex-1 bg-gray-200" />
          </div>

          {/* Tabs */}
          <div className="flex rounded-lg bg-gray-100 p-1 text-sm">
            {(['login', 'signup'] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => { setTab(t); setAuthError(null); }}
                className={`flex-1 rounded-md py-1.5 font-medium transition-colors ${tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
              >
                {t === 'login' ? 'Já tenho conta' : 'Criar conta'}
              </button>
            ))}
          </div>

          <form onSubmit={tab === 'login' ? handleSignIn : handleSignUp} className="space-y-3">
            <div>
              <label htmlFor="invite-email" className="block text-xs font-medium text-gray-700">Email</label>
              <input
                id="invite-email"
                type="email"
                required
                readOnly={tab === 'signup'}
                value={formEmail}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-2.5 text-sm read-only:bg-gray-100 read-only:text-gray-600 focus:border-primary focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              {tab === 'signup' && (
                <p className="mt-1 text-[11px] text-gray-500">
                  O email do convite tem de coincidir com o da nova conta.
                </p>
              )}
            </div>

            <div>
              <label htmlFor="invite-password" className="block text-xs font-medium text-gray-700">
                {tab === 'signup' ? 'Nova password' : 'Password'}
              </label>
              <input
                id="invite-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={tab === 'signup' ? 'Mínimo 8 caracteres' : '••••••••'}
                className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-2.5 text-sm focus:border-primary focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>

            {tab === 'signup' && (
              <div>
                <label htmlFor="invite-pass-confirm" className="block text-xs font-medium text-gray-700">Confirmar password</label>
                <input
                  id="invite-pass-confirm"
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-2.5 text-sm focus:border-primary focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
            )}

            {authError && (
              <div className="rounded-lg bg-red-50 p-2.5 text-xs text-red-600">{authError}</div>
            )}

            <button
              type="submit"
              disabled={authBusy || oauthLoading !== null}
              className="flex w-full items-center justify-center gap-2 rounded-xl gradient-primary px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {authBusy && <Loader2 className="h-4 w-4 animate-spin" />}
              {tab === 'login' ? 'Entrar e aceitar convite' : 'Criar conta e aceitar convite'}
            </button>
          </form>

          <p className="text-center text-[11px] text-gray-400">
            Ao continuar concordas com os termos do FaturaAI.
          </p>
        </div>
      </div>
    </div>
  );
}

