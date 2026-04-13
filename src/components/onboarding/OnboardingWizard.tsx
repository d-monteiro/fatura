import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { DEFAULT_ONBOARDING_DATA, type OnboardingData } from './onboardingTypes';
import { ArrowLeft, ArrowRight, Send } from 'lucide-react';

const TOTAL_STEPS = 7;

export function OnboardingWizard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [data, setData] = useState<OnboardingData>(DEFAULT_ONBOARDING_DATA);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onChange = useCallback((updates: Partial<OnboardingData>) => {
    setData((prev) => ({ ...prev, ...updates }));
  }, []);

  // Auto-save to onboarding_submissions on step change
  useEffect(() => {
    if (!user) return;
    const save = async () => {
      const payload = {
        user_id: user.id,
        email: user.email ?? '',
        current_step: step,
        block_company: { companyName: data.companyName, nif: data.nif, country: data.country, sector: data.sector, sectorCustom: data.sectorCustom, primaryColor: data.primaryColor, secondaryColor: data.secondaryColor },
        block_invoice_intel: { invoiceNameVariations: data.invoiceNameVariations, invoicesPerMonth: data.invoicesPerMonth, categories: data.categories, topSuppliers: data.topSuppliers, documentTypes: data.documentTypes },
        block_storage: { storageProvider: data.storageProvider, folderStructure: data.folderStructure, autoSheets: data.autoSheets },
        block_dashboard: { currency: data.currency, autoReports: data.autoReports },
        block_automation: { emailSync: data.emailSync, emailAddresses: data.emailAddresses },
        selected_plan: data.selectedPlan || null,
        billing_cycle: data.billingCycle,
      };

      if (submissionId) {
        await supabase.from('onboarding_submissions').update(payload).eq('id', submissionId);
      } else {
        const { data: row } = await supabase.from('onboarding_submissions').insert({ ...payload, status: 'draft' }).select('id').single();
        if (row) setSubmissionId(row.id);
      }
    };
    save();
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async () => {
    if (!user || submitting) return;
    setSubmitting(true);
    try {
      if (submissionId) {
        await supabase.from('onboarding_submissions').update({ status: 'submitted', selected_plan: data.selectedPlan, billing_cycle: data.billingCycle }).eq('id', submissionId);
      }
      // For now, redirect to dashboard. Stripe checkout will be added in Phase 5.
      navigate('/');
    } finally {
      setSubmitting(false);
    }
  };

  const canProceed = () => {
    if (step === 1) return data.companyName.length >= 2 && data.nif.length > 0 && data.sector.length > 0;
    if (step === 7) return data.selectedPlan.length > 0;
    return true;
  };

  const goToStep = (s: number) => setStep(Math.max(1, Math.min(TOTAL_STEPS, s)));

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-primary">FaturaAI</h1>
          <p className="text-sm text-muted-foreground mt-1">Configuration de votre espace</p>
        </div>

        <ProgressBar currentStep={step} totalSteps={TOTAL_STEPS} />

        <div className="mt-8 mb-8">
          {step === 1 && <StepCompany data={data} onChange={onChange} />}
          {step === 2 && <StepInvoiceIntel data={data} onChange={onChange} />}
          {step === 3 && <StepStorage data={data} onChange={onChange} />}
          {step === 4 && <StepDashboard data={data} onChange={onChange} />}
          {step === 5 && <StepAutomation data={data} onChange={onChange} />}
          {step === 6 && <StepReview data={data} onGoToStep={goToStep} />}
          {step === 7 && <StepPayment data={data} onChange={onChange} />}
        </div>

        <div className="flex justify-between">
          <Button
            variant="outline"
            onClick={() => goToStep(step - 1)}
            disabled={step === 1}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" /> Précédent
          </Button>

          {step < TOTAL_STEPS ? (
            <Button
              onClick={() => goToStep(step + 1)}
              disabled={!canProceed()}
              className="gap-2"
            >
              Suivant <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={!canProceed() || submitting}
              className="gap-2"
            >
              <Send className="h-4 w-4" />
              {data.selectedPlan === 'entreprise' ? 'Nous contacter' : 'Commencer l\'essai gratuit'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
