export const UNLIMITED_TRIAL_CUTOFF = new Date('2090-01-01T00:00:00Z').getTime();

export function isUnlimitedTrial(trialEndsAt: string | null | undefined): boolean {
  if (!trialEndsAt) return false;
  const t = new Date(trialEndsAt).getTime();
  if (Number.isNaN(t)) return false;
  return t >= UNLIMITED_TRIAL_CUTOFF;
}
