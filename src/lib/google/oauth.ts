import { supabase } from '@/lib/supabase/client';
import { track } from '@/lib/analytics/track';
import { EVENTS } from '@/lib/analytics/events';

export type OAuthSource = 'onboarding' | 'upload' | 'settings';

interface OAuthParams {
  userId?: string;
  source: OAuthSource;
  companyId?: string;
  loginHint?: string;
  promptSelect?: boolean;
}

export async function redirectToGoogleOAuth(params: OAuthParams): Promise<void> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) throw new Error('Config Supabase em falta');

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Sessão em falta. Faz login primeiro.');

  const response = await fetch(`${supabaseUrl}/functions/v1/oauth-start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      source: params.source,
      company_id: params.companyId ?? null,
      origin: window.location.origin,
      prompt_select: params.promptSelect ?? false,
      login_hint: params.loginHint,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Falha ao iniciar OAuth: ${detail.slice(0, 200)}`);
  }

  const { auth_url } = await response.json();
  if (!auth_url) throw new Error('auth_url em falta na resposta');

  track(EVENTS.GOOGLE_OAUTH_INITIATED, {
    source: params.source,
    has_company: !!params.companyId,
    prompt_select: !!params.promptSelect,
  });

  window.location.href = auth_url;
}
