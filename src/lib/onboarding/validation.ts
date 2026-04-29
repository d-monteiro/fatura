import type { OnboardingData } from '@/components/onboarding/onboardingTypes';
import { isValidNif } from '@/lib/utils/validation';

function sanitizeNifForCountry(raw: string, country: string): string {
  const trimmed = raw.trim();
  return country === 'PT' ? trimmed.replace(/\D/g, '') : trimmed;
}

// 5 steps: 1=Empresa, 2=Faturas, 3=Configuração, 4=Resumo, 5=Plano
export function validateStep(step: number, data: OnboardingData): string | null {
  if (step === 1) {
    if (data.companyName.trim().length < 2) return 'Indique o nome da empresa.';
    if (!data.sector) return 'Escolha um setor.';
    if (data.sector === 'outro' && !data.sectorCustom.trim()) return 'Especifique o setor.';
    const nif = sanitizeNifForCountry(data.nif, data.country);
    if (!nif) return 'Indique o NIF.';
    if (data.country === 'PT' && !isValidNif(nif)) return 'NIF português inválido (9 dígitos + checksum).';
    return null;
  }

  if (step === 2) {
    const nonEmpty = data.invoiceNameVariations.map((v) => v.trim()).filter(Boolean);
    if (nonEmpty.length === 0) {
      return 'Indique pelo menos uma variação do nome da sua empresa como aparece nas faturas.';
    }
    if (data.documentTypes.length === 0) {
      return 'Escolha pelo menos um tipo de documento.';
    }
    return null;
  }

  if (step === 3) {
    if (!data.storageProvider) return 'Escolha um fornecedor de armazenamento.';
    return null;
  }

  if (step === 4) {
    return null;
  }

  if (step === 5) {
    if (!data.selectedPlan) return 'Selecione um plano.';
    return null;
  }

  return null;
}

export function validateAllUpTo(step: number, data: OnboardingData): string | null {
  for (let s = 1; s <= step; s++) {
    const err = validateStep(s, data);
    if (err) return err;
  }
  return null;
}
