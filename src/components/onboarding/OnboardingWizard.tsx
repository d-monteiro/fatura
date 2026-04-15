import { useState, useCallback, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { ProgressBar } from './ProgressBar';
import { StepCompany } from './StepCompany';
import { StepInvoiceIntel } from './StepInvoiceIntel';
import { StepStorage } from './StepStorage';
import { StepDashboard } from './StepDashboard';
import { StepAutomation } from './StepAutomation';
import { StepReview } from './StepReview';
import { StepPayment } from './StepPayment';
import { EnterpriseContactForm } from './EnterpriseContactForm';
import { AccountInlinePanel } from './AccountInlinePanel';
import { DEFAULT_ONBOARDING_DATA, type OnboardingData } from './onboardingTypes';
import {
  loadStoredOnboarding,
  clearStoredOnboarding,
  useOnboardingStorage,
} from './useOnboardingStorage';
import { notifySlack } from '@/lib/slack/notify';
import { finalizeOnboarding } from '@/lib/onboarding/finalize';
import { ArrowLeft, ArrowRight, Send } from 'lucide-react';

const TOTAL_STEPS = 7;

export function OnboardingWizard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Restore any previous progress from localStorage on first render.
  const stored = loadStoredOnboarding();
  const [step, setStep] = useState(stored.step);
  const [maxReachedStep, setMaxReachedStep] = useState(stored.step);
  const [data, setData] = useState<OnboardingData>(stored.data);
  const [submitting, setSubmitting] = useState(false);
  const [showEnterpriseForm, setShowEnterpriseForm] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Persist data + step to localStorage on every change.
  useOnboardingStorage(data, step);

  const onChange = useCallback((updates: Partial<OnboardingData>) => {
    setData((prev) => ({ ...prev, ...updates }));
  }, []);

  // If the user is authenticated and already has a tenant, skip onboarding entirely.
  useEffect(() => {
    if (!user) return;
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
        navigate('/', { replace: true });
      }
    })();
    return () => { cancelled = true; };
  }, [user, navigate]);

  const createTenantForCurrentUser = useCallback(async (activeUserId: string, activeEmail: string) => {
    const { data: plan } = await supabase
      .from('plans').select('id').eq('slug', data.selectedPlan).single();

    const slug = data.companyName.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
      .substring(0, 40) || `tenant-${Date.now()}`;

    const trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: newTenantId, error: tErr } = await supabase.rpc('create_tenant_with_owner', {
      tenant_data: {
        name: data.companyName,
        slug: `${slug}-${Date.now().toString(36)}`,
        nif: data.nif,
        sector: data.sector === 'autre' ? data.sectorCustom : data.sector,
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
        invoice_name_variations: data.invoiceNameVariations ?? [],
        onboarding_data: {
          categories: data.categories,
          topSuppliers: data.topSuppliers,
          documentTypes: data.documentTypes,
          emailSync: data.emailSync,
          emailAddresses: data.emailAddresses,
        },
      },
    });

    if (tErr || !newTenantId) throw new Error(tErr?.message ?? 'Falha ao criar a conta.');
    const tenant = { id: newTenantId as string };

    // Best-effort bootstrap (categories, suppliers, default company, Drive folder).
    try {
      await finalizeOnboarding({ tenantId: tenant.id, userId: activeUserId, data });
    } catch (e) {
      console.warn('[onboarding] finalize warning', e);
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

  /**
   * Final submit for Starter / Pro.
   * Must be called with an already-authenticated user; the inline panel
   * handles sign-up/sign-in and then invokes this through `onAuthenticated`.
   */
  const finishStarterPro = useCallback(async (activeUserId: string, activeEmail: string) => {
    if (submitting) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      await createTenantForCurrentUser(activeUserId, activeEmail);
      clearStoredOnboarding();
      navigate('/', { replace: true });
    } catch (e) {
      console.error('[onboarding]', e);
      setSubmitError(e instanceof Error ? e.message : 'Erro ao concluir a configuração.');
    } finally {
      setSubmitting(false);
    }
  }, [submitting, createTenantForCurrentUser, navigate]);

  // Triggered by the main "Começar teste grátis" button at the bottom.
  const handleSubmit = async () => {
    setSubmitError(null);

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
    setStep(target);
    setMaxReachedStep((prev) => Math.max(prev, target));
  };

  const jumpToStep = (s: number) => {
    if (s <= maxReachedStep) setStep(s);
  };

  const canProceed = () => {
    if (step === 1) return data.companyName.length >= 2 && data.nif.length > 0 && data.sector.length > 0;
    if (step === 7) return data.selectedPlan.length > 0;
    return true;
  };

  const wideStep = (step === 7 && !showEnterpriseForm) || step === 1;

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

  return (
    <div className="min-h-screen bg-background">
      <div className={`mx-auto px-6 md:px-10 py-8 ${wideStep ? 'max-w-5xl' : 'max-w-2xl'}`}>
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-primary">FaturaAI</h1>
            <p className="text-sm text-muted-foreground mt-1">Configuração do seu espaço</p>
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
          {step === 3 && <StepStorage data={data} onChange={onChange} />}
          {step === 4 && <StepDashboard data={data} onChange={onChange} />}
          {step === 5 && <StepAutomation data={data} onChange={onChange} />}
          {step === 6 && <StepReview data={data} onGoToStep={goToStep} />}
          {step === 7 && <StepPayment data={data} onChange={onChange} />}
        </div>

        {/* Inline account creation appears only on step 7 and only for Starter/Pro. */}
        {step === 7
          && !user
          && data.selectedPlan
          && data.selectedPlan !== 'entreprise' && (
          <AccountInlinePanel
            submitting={submitting}
            onAuthenticated={(uid, email) => { void finishStarterPro(uid, email); }}
            onError={(m) => setSubmitError(m)}
          />
        )}

        {submitError && (
          <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {submitError}
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
              disabled={!canProceed()}
              className="gap-2"
            >
              Seguinte <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={!canProceed() || submitting || (!user && data.selectedPlan !== 'entreprise')}
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
