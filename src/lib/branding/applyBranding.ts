const HEX = /^#([0-9a-f]{6})$/i;

const VARS = [
  '--color-primary',
  '--color-primary-foreground',
  '--color-accent',
  '--color-accent-foreground',
] as const;

function normalize(color: string | null | undefined): string | null {
  if (!color) return null;
  const trimmed = color.trim();
  return HEX.test(trimmed) ? trimmed : null;
}

function contrastForeground(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 150 ? '#111111' : '#FFFFFF';
}

export function applyBranding(primary: string | null, secondary: string | null): void {
  const root = document.documentElement.style;
  const p = normalize(primary);
  const s = normalize(secondary);

  if (p) {
    root.setProperty('--color-primary', p);
    root.setProperty('--color-primary-foreground', contrastForeground(p));
  } else {
    root.removeProperty('--color-primary');
    root.removeProperty('--color-primary-foreground');
  }

  if (s) {
    root.setProperty('--color-accent', s);
    root.setProperty('--color-accent-foreground', contrastForeground(s));
  } else {
    root.removeProperty('--color-accent');
    root.removeProperty('--color-accent-foreground');
  }
}

export function clearBranding(): void {
  const root = document.documentElement.style;
  for (const v of VARS) root.removeProperty(v);
}
