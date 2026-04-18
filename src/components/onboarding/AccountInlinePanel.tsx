import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase/client';
import { ShieldCheck } from 'lucide-react';
import { OAUTH_PROVIDERS, type OAuthProviderId } from '@/components/common/oauthProviders';

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

  const handleOAuth = async (provider: OAuthProviderId) => {
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
        {OAUTH_PROVIDERS.map(({ id, label, icon: Icon, enabled }) => (
          <Button
            key={id}
            type="button"
            variant="outline"
            onClick={() => enabled && handleOAuth(id)}
            disabled={busy || !enabled}
            aria-disabled={!enabled}
            title={enabled ? undefined : 'Disponível em breve'}
            className="relative gap-2 h-10 bg-white hover:bg-gray-50 disabled:cursor-not-allowed"
          >
            <Icon /> Continuar com {label}
            {!enabled && (
              <span className="absolute -top-2 -right-2 rounded-full bg-accent px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-accent-foreground shadow-sm">
                Em breve
              </span>
            )}
          </Button>
        ))}
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
