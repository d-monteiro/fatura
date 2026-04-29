import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase/client';
import { ShieldCheck } from 'lucide-react';
import { OAUTH_PROVIDERS, type OAuthProviderId } from '@/components/common/oauthProviders';
import { LegalConsentCheckboxes } from './LegalConsentCheckboxes';

interface Props {
  submitting: boolean;
  onAuthenticated: (userId: string, email: string) => void;
  onError: (message: string) => void;
  onBeforeOAuth?: () => void;
}

export function AccountInlinePanel({ submitting, onAuthenticated, onError, onBeforeOAuth }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [localSubmitting, setLocalSubmitting] = useState(false);
  const [consentError, setConsentError] = useState(false);
  const [consentErrorNonce, setConsentErrorNonce] = useState(0);

  const busy = submitting || localSubmitting;
  const accepted = acceptedTerms && acceptedPrivacy;

  const triggerConsentError = () => {
    setConsentError(true);
    setConsentErrorNonce((n) => n + 1);
  };

  const handleTermsChange = (v: boolean) => {
    setAcceptedTerms(v);
    setConsentError(false);
  };
  const handlePrivacyChange = (v: boolean) => {
    setAcceptedPrivacy(v);
    setConsentError(false);
  };

  const handleOAuth = async (provider: OAuthProviderId) => {
    if (!accepted) {
      triggerConsentError();
      return;
    }
    try {
      setLocalSubmitting(true);
      onBeforeOAuth?.();
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: `${window.location.origin}/auth/callback?intent=signup` },
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
    if (!accepted) {
      triggerConsentError();
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

  const googleProvider = OAUTH_PROVIDERS.find((p) => p.id === 'google');
  const otherProviders = OAUTH_PROVIDERS.filter((p) => p.id !== 'google');
  const [showEmailForm, setShowEmailForm] = useState(false);

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

      {/* Termos ANTES dos botões: aplica-se a Google e a email. Mantém o aviso à
          vista da pessoa que clica direto em "Continuar com Google". */}
      <LegalConsentCheckboxes
        acceptedTerms={acceptedTerms}
        acceptedPrivacy={acceptedPrivacy}
        onTermsChange={handleTermsChange}
        onPrivacyChange={handlePrivacyChange}
        disabled={busy}
        error={consentError}
        errorNonce={consentErrorNonce}
      />

      {/* Google em destaque — caminho recomendado, 1 clique. */}
      {googleProvider && (
        <div className="space-y-1.5">
          <Button
            type="button"
            onClick={() => googleProvider.enabled && handleOAuth(googleProvider.id)}
            disabled={busy || !googleProvider.enabled}
            className="w-full h-12 gap-2 bg-white text-foreground border-2 border-primary/40 shadow-sm hover:bg-gray-50 hover:border-primary"
          >
            <googleProvider.icon />
            <span className="font-semibold">Continuar com Google</span>
            <span className="ml-1 text-[10px] font-medium uppercase tracking-wider text-primary">recomendado</span>
          </Button>
          <p className="text-[11px] text-muted-foreground text-center">1 clique · sem palavra-passe nova</p>
        </div>
      )}

      {otherProviders.length > 0 && (
        <div className="grid grid-cols-1 gap-2">
          {otherProviders.map(({ id, label, icon: Icon, enabled }) => (
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
      )}

      <div className="flex items-center gap-3 py-1">
        <span className="h-px flex-1 bg-primary/20" />
        <button
          type="button"
          onClick={() => setShowEmailForm((v) => !v)}
          className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-primary transition-colors"
        >
          {showEmailForm ? 'esconder email' : 'ou criar com email'}
        </button>
        <span className="h-px flex-1 bg-primary/20" />
      </div>

      {showEmailForm && (
        <div className="space-y-3">
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
            variant="outline"
            className="w-full h-10"
          >
            {busy ? 'A criar a sua conta...' : 'Criar conta com email'}
          </Button>
        </div>
      )}
    </div>
  );
}
