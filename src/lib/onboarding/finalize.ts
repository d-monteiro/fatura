// Bootstrap pós-onboarding. Seed de categorias + empresa default vive agora
// dentro do RPC create_tenant_with_owner (atomic com o tenant). Esta função
// trata só do que precisa do cliente: Drive root folder e logo upload.

import { supabase } from '@/lib/supabase/client';
import { ensureFolder } from '@/lib/google/drive';
import { reportError } from '@/lib/errors/errorReporter';
import { CATEGORY_TEMPLATES, type OnboardingData } from '@/components/onboarding/onboardingTypes';

function slugify(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'cat';
}

export interface CategoryPayload {
  axis: 'cost_type' | 'metier' | 'nature_depense';
  code: string;
  label: string;
  sort_order: number;
}

export interface DefaultCompanyPayload {
  name: string;
  short_name: string;
  nif: string | null;
}

export function buildCategoriesPayload(sector: string): CategoryPayload[] {
  const effectiveSector = sector === 'outro' ? 'services' : sector;
  const tpl = CATEGORY_TEMPLATES[effectiveSector] ?? CATEGORY_TEMPLATES.services
    ?? { metiers: [], natures: [], cost_types: ['Custos fixos', 'Custos variáveis'] };

  const rows: CategoryPayload[] = [];
  tpl.cost_types.forEach((label, i) => rows.push({
    axis: 'cost_type',
    code: label.toLowerCase().includes('fix') ? 'cout_fixe'
      : label.toLowerCase().includes('var') ? 'cout_variable'
      : slugify(label),
    label,
    sort_order: i,
  }));
  tpl.metiers.forEach((label, i) => rows.push({
    axis: 'metier', code: slugify(label), label, sort_order: i,
  }));
  tpl.natures.forEach((label, i) => rows.push({
    axis: 'nature_depense', code: slugify(label), label, sort_order: i,
  }));
  return rows;
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

async function bootstrapDriveRoot(tenantId: string, userId: string, rootName: string) {
  const { data: tok } = await supabase.from('user_oauth_tokens')
    .select('access_token, token_expiry')
    .eq('user_id', userId).eq('provider', 'google')
    .order('is_primary_storage', { ascending: false }).limit(1).maybeSingle();
  if (!tok?.access_token) return;
  if (tok.token_expiry && new Date(tok.token_expiry) < new Date()) return;

  try {
    const folderId = await ensureFolder(tok.access_token, rootName);
    if (folderId) {
      await supabase.from('tenants').update({ drive_root_folder_id: folderId }).eq('id', tenantId);
    }
  } catch (err) {
    void reportError(err, {
      component: 'onboarding/bootstrapDriveRoot',
      tenantId,
      userId,
      level: 'warn',
    });
  }
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
    bootstrapDriveRoot(tenantId, userId, rootName),
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
