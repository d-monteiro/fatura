import { FULL_SCOPES } from './scopes';

export type OAuthSource = 'onboarding' | 'upload' | 'settings' | 'automations';

interface OAuthParams {
  userId: string;
  source: OAuthSource;
  companyId?: string;
  loginHint?: string;
  promptSelect?: boolean;
}

export function redirectToGoogleOAuth(params: OAuthParams): void {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!clientId || !supabaseUrl) {
    throw new Error('Config Google/Supabase em falta');
  }

  const state = JSON.stringify({
    user_id: params.userId,
    company_id: params.companyId ?? null,
    source: params.source,
  });

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', `${supabaseUrl}/functions/v1/oauth-callback`);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', FULL_SCOPES.join(' '));
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', params.promptSelect ? 'select_account consent' : 'consent');
  url.searchParams.set('state', state);
  if (params.loginHint) url.searchParams.set('login_hint', params.loginHint);

  window.location.href = url.toString();
}
