import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useTenant } from '@/contexts/TenantContext';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { ProgressBar } from './ProgressBar';
import { StepCompany } from './StepCompany';
import { StepInvoiceIntel } from './StepInvoiceIntel';
import { StepConfiguracao } from './StepConfiguracao';
import { StepReview } from './StepReview';
import { StepPayment } from './StepPayment';
import { EnterpriseContactForm } from './EnterpriseContactForm';
import { AccountInlinePanel } from './AccountInlinePanel';
import { type OnboardingData } from './onboardingTypes';
import {
  loadStoredOnboarding,
  clearStoredOnboarding,
  persistOnboardingNow,
  useOnboardingStorage,
} from './useOnboardingStorage';
import { notifySlack } from '@/lib/slack/notify';
import { finalizeOnboarding, buildCategoriesPayload, buildDefaultCompanyPayload } from '@/lib/onboarding/finalize';
import { reportError } from '@/lib/errors/errorReporter';
import { validateStep, validateAllUpTo } from '@/lib/onboarding/validation';
import { track } from '@/lib/analytics/track';
import { EVENTS, ONBOARDING_STEP_NAMES } from '@/lib/analytics/events';
import { ArrowLeft, ArrowRight, Send } from 'lucide-react';

const TOTAL_STEPS = 5;

// A constraint tenants_nif_format exige 9 dígitos exatos para PT. Para outros
// países, NIF pode ser qualquer coisa (não há validação server-side).
function sanitizeNifForCountry(raw: string, country: string): string {
  const trimmed = raw.trim();
  return country === 'PT' ? trimmed.replace(/\D/g, '') : trimmed;
}

export function OnboardingWizard() {
  const { user } = useAuth();
  const { refreshTenant } = useTenant();
  const { isAdmin } = useIsAdmin();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAdmin) navigate('/admin', { replace: true });
  }, [isAdmin, navigate]);

  const stored = loadStoredOnboarding();
  const [step, setStep] = useState(stored.step);
  const [maxReachedStep, setMaxReachedStep] = useState(stored.step);
  const [data, setData] = useState<OnboardingData>(stored.data);
  const [submitting, setSubmitting] = useState(false);
  const [showEnterpriseForm, setShowEnterpriseForm] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useOnboardingStorage(data, step);

  const stepEnteredAt = useRef<number>(0);
  const submittedRef = useRef(false);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    const resumedFrom = stored.step > 1 ? stored.step : null;
    track(EVENTS.ONBOARDING_STARTED, { resumed_from_step: resumedFrom });
    if (resumedFrom !== null) {
      track(EVENTS.ONBOARDING_RESUMED, {
        from_step: resumedFrom,
        from_step_name: ONBOARDING_STEP_NAMES[resumedFrom],
      });
    }
  }, [stored.step]);

  useEffect(() => {
    stepEnteredAt.current = Date.now();
    track(EVENTS.ONBOARDING_STEP_VIEWED, {
      step,
      step_name: ONBOARDING_STEP_NAMES[step],
    });
  }, [step]);

  useEffect(() => {
    function onBeforeUnload() {
      if (submittedRef.current) return;
      track(EVENTS.ONBOARDING_STEP_ABANDONED, {
        step,
        step_name: ONBOARDING_STEP_NAMES[step],
        time_spent_ms: Date.now() - stepEnteredAt.current,
      });
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [step]);

  const onChange = useCallback((updates: Partial<OnboardingData>) => {
    setData((prev) => ({ ...prev, ...updates }));
  }, []);

  // If the user is authenticated and already has a tenant, skip onboarding entirely.
  // Guard com `submitting`: durante o submit, o finishStarterPro já orquestra a
  // navegação após refreshTenant. Sem este guard, race com a query abaixo dispara
  // navigate('/') contra um TenantContext ainda stale → RequireTenant devolve
  // para /onboarding → loop de history.replaceState.
  useEffect(() => {
    if (!user || submitting) return;
    let cancelled = false;
    (async () => {
      const { data: membership } = await supabase
        .from('tenant_users')
        .select('tenant_id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();
      if (!cancelled && membership) {
        clearStoredOnboarding();
        await refreshTenant();
        navigate('/', { replace: true });
      }
    })();
    return () => { cancelled = true; };
  }, [user, navigate, submitting, refreshTenant]);

  const createTenantForCurrentUser = useCallback(async (activeUserId: string, activeEmail: string) => {
    const { data: plan } = await supabase
      .from('plans').select('id').eq('slug', data.selectedPlan).single();

    const slug = data.companyName.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
      .substring(0, 40) || `tenant-${Date.now()}`;

    const trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const sanitizedNif = sanitizeNifForCountry(data.nif, data.country);
    const effectiveSector = data.sector === 'outro' ? data.sectorCustom : data.sector;

    const { data: newTenantId, error: tErr } = await supabase.rpc('create_tenant_with_owner', {
      tenant_data: {
        name: data.companyName,
        slug: `${slug}-${Date.now().toString(36)}`,
        nif: sanitizedNif,
        sector: effectiveSector,
        country: data.country,
        primary_color: data.primaryColor,
        secondary_color: data.secondaryColor,
        plan_id: plan?.id ?? null,
        plan_status: 'trialing',
        trial_ends_at: trialEndsAt,
        onboarding_completed: true,
        setup_status: 'ready',
        currency: data.currency,
        language: 'pt',
        storage_provider: data.storageProvider,
        folder_structure: data.folderStructure,
        auto_sheets: data.autoSheets,
        auto_reports: data.autoReports,
        report_email: data.reportEmail.trim() || null,
        timezone: 'Europe/Lisbon',
        invoice_name_variations: data.invoiceNameVariations ?? [],
        onboarding_data: {
          documentTypes: data.documentTypes,
          emailSync: data.emailSync,
          emailAddresses: data.emailAddresses,
        },
        // Seeds atomic no RPC: se qualquer um falha, tenant não é criado.
        default_company: buildDefaultCompanyPayload(data.companyName, sanitizedNif),
        categories: buildCategoriesPayload(data.sector),
      },
    });

    if (tErr || !newTenantId) throw new Error(tErr?.message ?? 'Falha ao criar a conta.');
    const tenant = { id: newTenantId as string };

    // Drive root + logo — non-blocking. Seeds já foram criados atomic no RPC.
    try {
      await finalizeOnboarding({ tenantId: tenant.id, userId: activeUserId, data });
    } catch (e) {
      void reportError(e, {
        component: 'OnboardingWizard/finalize',
        tenantId: tenant.id,
        userId: activeUserId,
        level: 'warn',
      });
    }

    await notifySlack({
      channel: 'signups',
      payload: {
        tenant_name: data.companyName,
        plan_name: data.selectedPlan === 'pro' ? 'Pro' : 'Starter',
        email: activeEmail,
        country: data.country,
      },
    });
  }, [data]);

  // Pressupõe utilizador já autenticado: o AccountInlinePanel trata sign-up/sign-in
  // e só depois invoca esta via onAuthenticated.
  const finishStarterPro = useCallback(async (activeUserId: string, activeEmail: string) => {
    if (submitting) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      await createTenantForCurrentUser(activeUserId, activeEmail);
      submittedRef.current = true;
      track(EVENTS.ONBOARDING_SUBMITTED, {
        plan: data.selectedPlan,
        country: data.country,
        sector: data.sector,
        billing_cycle: data.billingCycle,
        storage_provider: data.storageProvider,
        email_sync: data.emailSync,
      });
      clearStoredOnboarding();
      // refreshTenant antes de navegar: RequireTenant no `/` precisa do tenant
      // carregado, senão redirect-loop para /onboarding.
      await refreshTenant();
      navigate('/', { replace: true });
    } catch (e) {
      void reportError(e, {
        component: 'OnboardingWizard/finishStarterPro',
        userId: activeUserId,
      });
      setSubmitError(e instanceof Error ? e.message : 'Erro ao concluir a configuração.');
    } finally {
      setSubmitting(false);
    }
  }, [submitting, createTenantForCurrentUser, navigate, refreshTenant, data.selectedPlan, data.country, data.sector, data.billingCycle, data.storageProvider, data.emailSync]);

  const handleSubmit = async () => {
    setSubmitError(null);

    const formError = validateAllUpTo(TOTAL_STEPS, data);
    if (formError) {
      track(EVENTS.ONBOARDING_VALIDATION_BLOCKED, {
        step: TOTAL_STEPS,
        step_name: ONBOARDING_STEP_NAMES[TOTAL_STEPS],
        reason: formError,
        on: 'submit',
      });
      setSubmitError(formError);
      return;
    }

    // Empresarial opens the contact form — it handles everything internally.
    if (data.selectedPlan === 'entreprise') {
      setShowEnterpriseForm(true);
      return;
    }

    if (!user) {
      // The inline account panel is visible — it will drive the submit itself.
      setSubmitError('Preencha o email e palavra-passe acima para criar a sua conta.');
      return;
    }

    void finishStarterPro(user.id, user.email ?? '');
  };

  const goToStep = (s: number) => {
    const target = Math.max(1, Math.min(TOTAL_STEPS, s));
    if (target > step) {
      const blockedReason = validateStep(step, data);
      if (blockedReason) {
        track(EVENTS.ONBOARDING_VALIDATION_BLOCKED, {
          step,
          step_name: ONBOARDING_STEP_NAMES[step],
          reason: blockedReason,
          on: 'next',
        });
        return;
      }
      track(EVENTS.ONBOARDING_STEP_COMPLETED, {
        step,
        step_name: ONBOARDING_STEP_NAMES[step],
        time_spent_ms: Date.now() - stepEnteredAt.current,
      });
    }
    setStep(target);
    setMaxReachedStep((prev) => Math.max(prev, target));
  };

  const jumpToStep = (s: number) => {
    if (s > maxReachedStep) return;
    // Se algum step anterior a `s` (ou o próprio `s`) tem erro, parar no primeiro inválido.
    for (let i = 1; i <= s; i++) {
      if (validateStep(i, data) !== null) {
        setStep(i);
        return;
      }
    }
    setStep(s);
  };

  const currentStepError = validateStep(step, data);
  const fullFormError = validateAllUpTo(TOTAL_STEPS, data);

  const wideStep = (step === 5 && !showEnterpriseForm) || step === 1;

  // User OAuth que acabou de criar a conta neste round-trip. A janela de 15s
  // cobre o callback do Google sem apanhar quem volta minutos depois.
  const isFreshOAuthUser = !!user && (() => {
    const createdMs = user.created_at ? new Date(user.created_at).getTime() : 0;
    const lastSignInMs = user.last_sign_in_at ? new Date(user.last_sign_in_at).getTime() : 0;
    return createdMs > 0 && Math.abs(lastSignInMs - createdMs) < 15_000;
  })();

  // Enterprise flow: dedicated form (handles account-free submission too).
  if (showEnterpriseForm) {
    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-2xl px-4 py-8">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-primary">FaturaAI</h1>
              <p className="text-sm text-muted-foreground mt-1">Plano Empresarial</p>
            </div>
            <Link to="/login" className="text-xs text-muted-foreground hover:text-foreground">
              Já tem conta? Entrar
            </Link>
          </div>
          <EnterpriseContactForm
            data={data}
            onBack={() => setShowEnterpriseForm(false)}
            onSubmitted={() => { clearStoredOnboarding(); navigate('/onboarding/thanks'); }}
          />
        </div>
      </div>
    );
  }

  if (submitting) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-lg font-medium text-foreground">A criar o teu espaço...</p>
        <p className="text-sm text-muted-foreground">Isto demora apenas alguns segundos.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className={`mx-auto px-6 md:px-10 py-8 ${wideStep ? 'max-w-5xl' : 'max-w-2xl'}`}>
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-primary">FaturaAI</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {isFreshOAuthUser ? (
                <>Bem-vindo, <strong className="text-foreground">{user?.email}</strong>. Vamos configurar o teu espaço.</>
              ) : 'Configuração do seu espaço'}
            </p>
          </div>
          {!user && (
            <Link to="/login" className="text-xs text-muted-foreground hover:text-foreground">
              Já tem conta? Entrar
            </Link>
          )}
        </div>

        <ProgressBar
          currentStep={step}
          totalSteps={TOTAL_STEPS}
          maxReachedStep={maxReachedStep}
          onStepClick={jumpToStep}
        />

        <div className="mt-8 mb-8">
          {step === 1 && <StepCompany data={data} onChange={onChange} />}
          {step === 2 && <StepInvoiceIntel data={data} onChange={onChange} />}
          {step === 3 && <StepConfiguracao data={data} onChange={onChange} />}
          {step === 4 && <StepReview data={data} onGoToStep={goToStep} />}
          {step === 5 && <StepPayment data={data} onChange={onChange} />}
        </div>

        {/* Inline account creation appears only no passo final (5) e apenas para Starter/Pro. */}
        {step === 5
          && !user
          && data.selectedPlan
          && data.selectedPlan !== 'entreprise' && (
          <AccountInlinePanel
            submitting={submitting}
            onAuthenticated={(uid, email) => { void finishStarterPro(uid, email); }}
            onError={(m) => setSubmitError(m)}
            onBeforeOAuth={() => persistOnboardingNow(data, step)}
          />
        )}

        {submitError && (
          <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {submitError}
          </div>
        )}

        {(currentStepError || (step === TOTAL_STEPS && fullFormError)) && (
          <div className="mb-3 text-xs text-muted-foreground text-right">
            {step === TOTAL_STEPS && fullFormError ? fullFormError : currentStepError}
          </div>
        )}

        <div className="flex justify-between">
          <Button
            variant="outline"
            onClick={() => {
              if (step === 1) navigate('/');
              else goToStep(step - 1);
            }}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" /> {step === 1 ? 'Voltar' : 'Anterior'}
          </Button>

          {step < TOTAL_STEPS ? (
            <Button
              onClick={() => goToStep(step + 1)}
              disabled={!!currentStepError}
              title={currentStepError ?? undefined}
              className="gap-2"
            >
              Seguinte <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={!!fullFormError || submitting || (!user && data.selectedPlan !== 'entreprise')}
              title={fullFormError ?? undefined}
              className="gap-2"
            >
              <Send className="h-4 w-4" />
              {submitting
                ? 'A processar...'
                : data.selectedPlan === 'entreprise'
                  ? 'Contactar-nos'
                  : 'Começar teste grátis de 7 dias'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
