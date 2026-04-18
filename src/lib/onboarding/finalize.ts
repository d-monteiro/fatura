/**
 * Bootstrap pós-onboarding: seed categorias, fornecedores, empresa default e pasta root no Drive.
 * Chamado pelo OnboardingWizard depois de criar o tenant + tenant_users.
 * Tolerante a falhas: cada passo é independente, falhas não bloqueiam outros.
 */

import { supabase } from '@/lib/supabase/client';
import { ensureFolder } from '@/lib/google/drive';
import { CATEGORY_TEMPLATES, type OnboardingData } from '@/components/onboarding/onboardingTypes';

function slugify(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'cat';
}

async function seedCategories(tenantId: string, sector: string, extraCategories: string[]) {
  const tpl = CATEGORY_TEMPLATES[sector] ?? CATEGORY_TEMPLATES.services ?? { metiers: [], natures: [], cost_types: ['Custos fixos', 'Custos variáveis'] };
  const rows: { tenant_id: string; axis: string; code: string; label: string; sort_order: number }[] = [];

  tpl.cost_types.forEach((label, i) => rows.push({
    tenant_id: tenantId, axis: 'cost_type',
    code: label.toLowerCase().includes('fix') ? 'cout_fixe' : label.toLowerCase().includes('var') ? 'cout_variable' : slugify(label),
    label, sort_order: i,
  }));
  tpl.metiers.forEach((label, i) => rows.push({
    tenant_id: tenantId, axis: 'metier', code: slugify(label), label, sort_order: i,
  }));

  const allNatures = Array.from(new Set([...tpl.natures, ...extraCategories]));
  allNatures.forEach((label, i) => rows.push({
    tenant_id: tenantId, axis: 'nature_depense', code: slugify(label), label, sort_order: i,
  }));

  if (rows.length) await supabase.from('categories').insert(rows);
}

async function seedSuppliers(tenantId: string, topSuppliers: string[]) {
  if (!topSuppliers?.length) return;
  await supabase.from('suppliers').insert(topSuppliers.map((s) => ({
    tenant_id: tenantId,
    name: s.toUpperCase(),
    display_name: s,
    name_variations: [s],
  })));
}

async function seedDefaultCompany(tenantId: string, companyName: string, nif: string) {
  if (!companyName) return;
  const short = companyName.split(/\s+/)[0]?.toUpperCase() ?? 'EMPRESA';
  const nifClean = nif.trim() || null;
  const { error } = await supabase.from('companies').insert({
    tenant_id: tenantId,
    name: companyName,
    short_name: short.substring(0, 16),
    nif: nifClean,
    is_default: true,
    is_active: true,
  });
  if (error) console.error('[onboarding] seedDefaultCompany failed:', error);
}

async function bootstrapDriveRoot(tenantId: string, userId: string, rootName: string) {
  const { data: tok } = await supabase.from('user_oauth_tokens')
    .select('access_token, token_expiry')
    .eq('user_id', userId).eq('provider', 'google')
    .order('is_primary_storage', { ascending: false }).limit(1).maybeSingle();
  if (!tok?.access_token) return; // user vai conectar Drive depois
  if (tok.token_expiry && new Date(tok.token_expiry) < new Date()) return; // skip se expirado, pipeline trata depois

  try {
    const folderId = await ensureFolder(tok.access_token, rootName);
    if (folderId) {
      await supabase.from('tenants').update({ drive_root_folder_id: folderId }).eq('id', tenantId);
    }
  } catch {
    // sem bloquear onboarding
  }
}

async function persistLogo(tenantId: string, logoDataUrl: string | null) {
  if (!logoDataUrl || !logoDataUrl.startsWith('data:image/')) return;
  const { error } = await supabase.from('tenants')
    .update({ logo_url: logoDataUrl })
    .eq('id', tenantId);
  if (error) console.error('[onboarding] persistLogo failed:', error);
}

export async function finalizeOnboarding(opts: {
  tenantId: string;
  userId: string;
  data: OnboardingData;
}): Promise<void> {
  const { tenantId, userId, data } = opts;
  const sector = data.sector === 'autre' ? 'services' : data.sector;
  const rootName = 'FATURAS';

  const results = await Promise.allSettled([
    seedCategories(tenantId, sector, data.categories),
    seedSuppliers(tenantId, data.topSuppliers),
    seedDefaultCompany(tenantId, data.companyName, data.nif),
    supabase.from('tenants').update({ drive_root_folder_name: rootName }).eq('id', tenantId),
    bootstrapDriveRoot(tenantId, userId, rootName),
    persistLogo(tenantId, data.logoDataUrl),
  ]);
  results.forEach((r, i) => {
    if (r.status === 'rejected') console.error(`[onboarding] step ${i} rejected:`, r.reason);
  });
}
