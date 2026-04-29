import { useEffect, useRef } from 'react';
import { DEFAULT_ONBOARDING_DATA, type OnboardingData } from './onboardingTypes';

const STORAGE_KEY = 'faturai-onboarding-v1';
const STEP_KEY = 'faturai-onboarding-step-v1';

export function loadStoredOnboarding(): { data: OnboardingData; step: number } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const stepRaw = localStorage.getItem(STEP_KEY);
    const data = raw ? { ...DEFAULT_ONBOARDING_DATA, ...JSON.parse(raw) } : DEFAULT_ONBOARDING_DATA;
    if (data.sector === 'autre') data.sector = 'outro';
    const step = stepRaw ? Math.max(1, Math.min(5, parseInt(stepRaw, 10) || 1)) : 1;
    return { data, step };
  } catch {
    return { data: DEFAULT_ONBOARDING_DATA, step: 1 };
  }
}

export function clearStoredOnboarding() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STEP_KEY);
  } catch { /* ignore */ }
}

// Flush síncrono — usar antes de qualquer redirect (ex: OAuth), já que o
// useEffect de `useOnboardingStorage` só escreve no próximo ciclo de render.
export function persistOnboardingNow(data: OnboardingData, step: number) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    localStorage.setItem(STEP_KEY, String(step));
  } catch { /* ignore */ }
}

// Permite retomar o wizard depois de fechar o separador. Skip no primeiro render
// para não sobrescrever o que foi restaurado em loadStoredOnboarding.
export function useOnboardingStorage(data: OnboardingData, step: number) {
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      localStorage.setItem(STEP_KEY, String(step));
    } catch { /* storage full or disabled — ignore */ }
  }, [data, step]);
}
