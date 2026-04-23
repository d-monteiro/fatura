import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase/client';
import { ArrowRight, Sparkles } from 'lucide-react';
import { translateAuthError } from '@/lib/utils/authErrors';
import { reportError } from '@/lib/errors/errorReporter';

const GoogleIcon = () => (
  <svg className="h-5 w-5" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
  </svg>
);

const MicrosoftIcon = () => (
  <svg className="h-5 w-5" viewBox="0 0 23 23">
    <path fill="#f25022" d="M1 1h10v10H1z" />
    <path fill="#00a4ef" d="M1 12h10v10H1z" />
    <path fill="#7fba00" d="M12 1h10v10H12z" />
    <path fill="#ffb900" d="M12 12h10v10H12z" />
  </svg>
);

interface Props {
  onContinue: () => void;
}

export function StepAccount({ onContinue }: Props) {
  const [mode, setMode] = useState<'signup' | 'login'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const reset = () => {
    setError(null);
    setInfo(null);
  };

  const handleAuthFailure = (err: unknown, component: string) => {
    const { message, level } = translateAuthError(err);
    setError(message);
    void reportError(err, { component, level, skipSlack: level === 'warn' });
  };

  const handleOAuth = async (provider: 'google' | 'azure') => {
    reset();
    setSubmitting(true);
    const { error: oauthErr } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/onboarding` },
    });
    if (oauthErr) {
      handleAuthFailure(oauthErr, 'StepAccount.oauth');
      setSubmitting(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    reset();
    const trimmedEmail = email.trim();
    if (!trimmedEmail || password.length < 6) {
      setError('Introduz um email válido e uma palavra-passe com pelo menos 6 caracteres.');
      return;
    }
    setSubmitting(true);
    try {
      if (mode === 'signup') {
        const { data, error: signupErr } = await supabase.auth.signUp({
          email: trimmedEmail,
          password,
        });
        if (signupErr) throw signupErr;
        if (!data.session) {
          setInfo(
            'Conta criada. Enviámos um email para confirmares o teu endereço — abre-o para continuar o onboarding.',
          );
          return;
        }
      } else {
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password,
        });
        if (signInErr) throw signInErr;
      }
      onContinue();
    } catch (err) {
      handleAuthFailure(err, `StepAccount.${mode}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-background to-primary/5">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary mb-4">
            <Sparkles className="h-3 w-3" />
            7 dias grátis · Sem cartão
          </div>
          <h1 className="text-3xl font-bold">
            {mode === 'signup' ? 'Criar conta FaturaAI' : 'Entrar no FaturaAI'}
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            {mode === 'signup'
              ? 'Depois configura a sua empresa em 5 minutos.'
              : 'Bem-vindo de volta.'}
          </p>
        </div>

        <div className="rounded-2xl border bg-card p-6 shadow-sm space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOAuth('google')}
              disabled={submitting}
              className="gap-2 h-11"
            >
              <GoogleIcon />
              Google
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOAuth('azure')}
              disabled={submitting}
              className="gap-2 h-11"
            >
              <MicrosoftIcon />
              Microsoft
            </Button>
          </div>

          <div className="relative my-2">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">ou com email</span>
            </div>
          </div>

          <form onSubmit={handleEmailAuth} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nome@empresa.pt"
                autoComplete="email"
                disabled={submitting}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs">Palavra-passe</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                disabled={submitting}
              />
            </div>

            {error && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                {error}
              </div>
            )}

            {info && (
              <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-foreground">
                {info}
              </div>
            )}

            <Button type="submit" disabled={submitting} className="w-full gap-2 h-11">
              {submitting
                ? 'A processar...'
                : mode === 'signup'
                  ? (<>Criar conta e continuar <ArrowRight className="h-4 w-4" /></>)
                  : (<>Entrar <ArrowRight className="h-4 w-4" /></>)}
            </Button>
          </form>

          <div className="text-center text-xs text-muted-foreground">
            {mode === 'signup' ? (
              <>
                Já tem conta?{' '}
                <button
                  type="button"
                  onClick={() => { setMode('login'); reset(); }}
                  className="text-primary font-medium hover:underline"
                >
                  Entrar
                </button>
              </>
            ) : (
              <>
                Ainda não tem conta?{' '}
                <button
                  type="button"
                  onClick={() => { setMode('signup'); reset(); }}
                  className="text-primary font-medium hover:underline"
                >
                  Criar conta
                </button>
              </>
            )}
          </div>
        </div>

        <div className="text-center mt-6">
          <Link to="/" className="text-xs text-muted-foreground hover:text-foreground">
            ← Voltar ao início
          </Link>
        </div>
      </div>
    </div>
  );
}
