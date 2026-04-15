import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase/client';
import { ShieldCheck } from 'lucide-react';

const GoogleIcon = () => (
  <svg className="h-4 w-4" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
  </svg>
);

const MicrosoftIcon = () => (
  <svg className="h-4 w-4" viewBox="0 0 23 23">
    <path fill="#f25022" d="M1 1h10v10H1z" />
    <path fill="#00a4ef" d="M1 12h10v10H1z" />
    <path fill="#7fba00" d="M12 1h10v10H12z" />
    <path fill="#ffb900" d="M12 12h10v10H12z" />
  </svg>
);

interface Props {
  submitting: boolean;
  onAuthenticated: (userId: string, email: string) => void;
  onError: (message: string) => void;
}

export function AccountInlinePanel({ submitting, onAuthenticated, onError }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localSubmitting, setLocalSubmitting] = useState(false);

  const busy = submitting || localSubmitting;

  const handleOAuth = async (provider: 'google' | 'azure') => {
    try {
      setLocalSubmitting(true);
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: `${window.location.origin}/onboarding` },
      });
      if (error) throw error;
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Falha ao autenticar com o fornecedor.');
      setLocalSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    if (!email.trim() || password.length < 6) {
      onError('Introduza um email válido e uma palavra-passe com pelo menos 6 caracteres.');
      return;
    }
    setLocalSubmitting(true);
    try {
      const { data: signupData, error: signupErr } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });
      if (signupErr) throw signupErr;
      let activeUser = signupData.user;
      if (!signupData.session) {
        const { data: loginData, error: loginErr } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (loginErr) {
          throw new Error(
            'A confirmação de email está ativa. Desative em Supabase → Authentication → Providers → Email para continuar agora.',
          );
        }
        activeUser = loginData.user;
      }
      if (!activeUser) throw new Error('Falha ao criar a sessão.');
      onAuthenticated(activeUser.id, activeUser.email ?? email.trim());
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Erro ao criar conta.');
    } finally {
      setLocalSubmitting(false);
    }
  };

  return (
    <div className="mb-4 rounded-xl border-2 border-primary/30 bg-primary/5 p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div>
          <h3 className="font-semibold">Último passo — criar a sua conta</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Sem cartão de crédito. 7 dias para testar tudo. Cancele a qualquer momento.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => handleOAuth('google')}
          disabled={busy}
          className="gap-2 h-10 bg-white hover:bg-gray-50"
        >
          <GoogleIcon /> Continuar com Google
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => handleOAuth('azure')}
          disabled={busy}
          className="gap-2 h-10 bg-white hover:bg-gray-50"
        >
          <MicrosoftIcon /> Continuar com Microsoft
        </Button>
      </div>

      <div className="flex items-center gap-3 py-1">
        <span className="h-px flex-1 bg-primary/20" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          ou com email
        </span>
        <span className="h-px flex-1 bg-primary/20" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="onbEmail" className="text-xs">Email</Label>
          <Input
            id="onbEmail"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nome@empresa.pt"
            autoComplete="email"
            disabled={busy}
            className="bg-white"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="onbPwd" className="text-xs">Palavra-passe</Label>
          <Input
            id="onbPwd"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mínimo 6 caracteres"
            autoComplete="new-password"
            disabled={busy}
            className="bg-white"
          />
        </div>
      </div>

      <Button
        type="button"
        onClick={handleSubmit}
        disabled={busy || !email.trim() || password.length < 6}
        className="w-full h-11"
      >
        {busy ? 'A criar a sua conta...' : 'Criar conta e começar teste grátis'}
      </Button>
    </div>
  );
}
