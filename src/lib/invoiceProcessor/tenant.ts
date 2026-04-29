import { supabase } from '@/lib/supabase/client';
import type { KnownSupplier } from '@/lib/utils/suppliers';
import { reportError } from '@/lib/errors/errorReporter';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export interface TenantContext {
  id: string;
  language: string;
  folderStructure: string;
  rootFolderName: string;
  autoSheets: boolean;
  knownSuppliers: KnownSupplier[];
}

export async function loadTenantContext(tenantId: string): Promise<TenantContext | null> {
  const { data: t } = await supabase.from('tenants')
    .select('id, language, folder_structure, drive_root_folder_name, auto_sheets')
    .eq('id', tenantId).is('deleted_at', null).single();
  if (!t) return null;

  const { data: suppliers } = await supabase.from('suppliers')
    .select('name, name_variations').eq('tenant_id', tenantId).limit(200);

  const known: KnownSupplier[] = (suppliers ?? []).map((s) => ({
    normalized: s.name as string,
    variations: ((s.name_variations as string[]) ?? []),
  }));

  return {
    id: t.id as string,
    language: (t.language as string) ?? 'pt',
    folderStructure: (t.folder_structure as string) ?? 'year_month',
    rootFolderName: (t.drive_root_folder_name as string) ?? 'FATURAS',
    autoSheets: t.auto_sheets !== false,
    knownSuppliers: known,
  };
}

export async function ensureFreshToken(userId: string): Promise<string | null> {
  const { data: row } = await supabase.from('user_oauth_tokens')
    .select('id, email, access_token, refresh_token, token_expiry')
    .eq('user_id', userId).eq('provider', 'google')
    .order('is_primary_storage', { ascending: false }).limit(1).single();
  if (!row) return null;
  if (row.token_expiry && new Date(row.token_expiry) > new Date(Date.now() + 5 * 60 * 1000)) return row.access_token;
  if (!row.refresh_token || !row.email) return null;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;
    const res = await fetch(`${SUPABASE_URL}/functions/v1/refresh-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ email: row.email }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      void reportError(`refresh-token endpoint falhou (${res.status})`, {
        component: 'invoiceProcessor/ensureFreshToken',
        userId,
        extra: { status: res.status, body: body.slice(0, 500) },
      });
      return null;
    }
    const { data: refreshed } = await supabase.from('user_oauth_tokens')
      .select('access_token').eq('id', row.id).single();
    return refreshed?.access_token || null;
  } catch (err) {
    void reportError(err, {
      component: 'invoiceProcessor/ensureFreshToken',
      userId,
      extra: { phase: 'network' },
    });
    return null;
  }
}
