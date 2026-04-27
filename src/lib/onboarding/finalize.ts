// Bootstrap pós-onboarding. Seed de categorias + empresa default vive agora
// dentro do RPC create_tenant_with_owner (atomic com o tenant). Esta função
// trata só do que precisa do cliente: logo upload (o root do Drive é criado
// lazy pelo backend na primeira fatura, via ensureFolderPath atómico).

import { supabase } from '@/lib/supabase/client';
import { reportError } from '@/lib/errors/errorReporter';
import { CATEGORY_TEMPLATES, type OnboardingData } from '@/components/onboarding/onboardingTypes';

function slugify(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'cat';
}

export interface CategoryPayload {
  axis: 'category';
  code: string;
  label: string;
  sort_order: number;
  is_fixed: boolean;
}

export interface DefaultCompanyPayload {
  name: string;
  short_name: string;
  nif: string | null;
}

export function buildCategoriesPayload(sector: string): CategoryPayload[] {
  const effectiveSector = sector === 'outro' ? 'services' : sector;
  const tpl = CATEGORY_TEMPLATES[effectiveSector] ?? CATEGORY_TEMPLATES.services ?? [];
  return tpl.map((c, i) => ({
    axis: 'category',
    code: slugify(c.label),
    label: c.label,
    sort_order: i,
    is_fixed: !!c.is_fixed,
  }));
}

export function buildDefaultCompanyPayload(companyName: string, nif: string): DefaultCompanyPayload | null {
  if (!companyName) return null;
  const short = companyName.split(/\s+/)[0]?.toUpperCase() ?? 'EMPRESA';
  return {
    name: companyName,
    short_name: short.substring(0, 16),
    nif: nif.trim() || null,
  };
}

async function persistLogo(tenantId: string, logoDataUrl: string | null) {
  if (!logoDataUrl || !logoDataUrl.startsWith('data:image/')) return;
  const { error } = await supabase.from('tenants')
    .update({ logo_url: logoDataUrl })
    .eq('id', tenantId);
  if (error) {
    void reportError(error.message, {
      component: 'onboarding/persistLogo',
      tenantId,
      extra: { code: error.code },
    });
  }
}

export async function finalizeOnboarding(opts: {
  tenantId: string;
  userId: string;
  data: OnboardingData;
}): Promise<void> {
  const { tenantId, userId, data } = opts;
  const rootName = 'FATURAS';

  const results = await Promise.allSettled([
    supabase.from('tenants').update({ drive_root_folder_name: rootName }).eq('id', tenantId),
    persistLogo(tenantId, data.logoDataUrl),
  ]);
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      void reportError(r.reason, {
        component: 'onboarding/finalize',
        tenantId,
        userId,
        extra: { stepIndex: i },
      });
    }
  });
}
