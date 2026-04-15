import { useEffect, useRef } from 'react';
import { DEFAULT_ONBOARDING_DATA, type OnboardingData } from './onboardingTypes';

const STORAGE_KEY = 'faturai-onboarding-v1';
const STEP_KEY = 'faturai-onboarding-step-v1';

export function loadStoredOnboarding(): { data: OnboardingData; step: number } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const stepRaw = localStorage.getItem(STEP_KEY);
    const data = raw ? { ...DEFAULT_ONBOARDING_DATA, ...JSON.parse(raw) } : DEFAULT_ONBOARDING_DATA;
    const step = stepRaw ? Math.max(1, Math.min(7, parseInt(stepRaw, 10) || 1)) : 1;
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

/**
 * Persists onboarding data + current step to localStorage so the visitor
 * can close the tab and resume without losing what they've filled in.
 */
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
