import { useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase/client';
import { FileText, Loader2 } from 'lucide-react';
import { OAUTH_PROVIDERS, type OAuthProviderId } from '@/components/common/oauthProviders';
import { toast } from 'sonner';
import { translateAuthError } from '@/lib/utils/authErrors';
import { reportError } from '@/lib/errors/errorReporter';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<OAuthProviderId | null>(null);
  const [resetting, setResetting] = useState(false);

  const showAuthError = (err: unknown, component: string) => {
    const { message, level } = translateAuthError(err);
    setError(message);
    void reportError(err, { component, level, skipSlack: level === 'warn' });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      showAuthError(authError, 'Login.signIn');
    }
    setLoading(false);
  };

  const handlePasswordReset = async () => {
    if (!email) {
      setError('Introduz o teu email primeiro para recuperarmos a palavra-passe.');
      return;
    }
    setError(null);
    setResetting(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    });
    setResetting(false);
    if (resetError) {
      showAuthError(resetError, 'Login.resetPassword');
      return;
    }
    toast.success('Email de recuperação enviado. Verifica a tua caixa de entrada (e spam).');
  };

  const handleOAuth = async (provider: OAuthProviderId) => {
    setError(null);
    setOauthLoading(provider);
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback?intent=login` },
    });
    if (oauthError) {
      showAuthError(oauthError, 'Login.oauth');
      setOauthLoading(null);
    }
  };

  const busy = loading || oauthLoading !== null;

  return (
    <div className="flex min-h-screen items-center justify-center gradient-dark px-4">
      <div className="w-full max-w-sm animate-fade-in-up">
        {/* Branding */}
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent">
            <FileText className="h-7 w-7 text-accent-foreground" />
          </div>
          <h1 className="mt-4 text-2xl font-bold text-white">
            Fatura<span className="text-accent">AI</span>
          </h1>
          <p className="mt-1 text-sm text-white/60">
            Gestão inteligente de faturas
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl bg-white p-6 shadow-card-hover sm:p-8">
          <div className="grid grid-cols-2 gap-3">
            {OAUTH_PROVIDERS.map(({ id, label, icon: Icon, enabled }) => (
              <button
                key={id}
                type="button"
                onClick={() => enabled && handleOAuth(id)}
                disabled={busy || !enabled}
                aria-disabled={!enabled}
                title={enabled ? undefined : 'Disponível em breve'}
                className="relative flex items-center justify-center gap-2 h-10 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {oauthLoading === id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon />}
                {label}
                {!enabled && (
                  <span className="absolute -top-2 -right-2 rounded-full bg-accent px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-accent-foreground shadow-sm">
                    Em breve
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="my-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-gray-200" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              ou com email
            </span>
            <span className="h-px flex-1 bg-gray-200" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-2.5 text-sm transition-colors focus:border-primary focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="email@exemplo.pt"
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  Palavra-passe
                </label>
                <button
                  type="button"
                  onClick={() => { void handlePasswordReset(); }}
                  disabled={busy || resetting}
                  className="text-xs text-primary hover:underline disabled:opacity-50"
                >
                  {resetting ? 'A enviar...' : 'Esqueceu-se?'}
                </button>
              </div>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-2.5 text-sm transition-colors focus:border-primary focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="rounded-xl bg-red-50 p-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-xl gradient-primary px-4 py-3 text-sm font-semibold text-white shadow-md transition-all hover:opacity-90 hover:shadow-lg disabled:opacity-60"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Entrar
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
