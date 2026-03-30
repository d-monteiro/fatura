import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import { toast } from 'sonner';

export interface ConnectedAccount {
  id: string;
  email: string;
  token_expiry: string;
  is_primary_storage: boolean;
  refresh_token: string | null;
  access_token?: string;
}

export interface SyncResult {
  processed: number;
  duplicates: number;
  skipped: number;
  errors: number;
}

// Gmail scopes commented out until Google OAuth verification is approved
const GOOGLE_SCOPES = [
  'email',
  'profile',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/spreadsheets',
  // 'https://www.googleapis.com/auth/gmail.readonly',
  // 'https://www.googleapis.com/auth/gmail.modify',
].join(' ');

export function isTokenExpired(expiryDate: string) {
  return new Date(expiryDate) < new Date();
}

export function useAutomationsData() {
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('user_oauth_tokens')
      .select('id, email, token_expiry, is_primary_storage, refresh_token')
      .eq('provider', 'google');
    setAccounts((data as ConnectedAccount[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  // Handle OAuth callback query params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthStatus = params.get('oauth');
    const email = params.get('email');
    const message = params.get('message');

    if (oauthStatus) {
      window.history.replaceState({}, document.title, window.location.pathname);
      if (oauthStatus === 'success' && email) {
        toast.success(`${email} connecté avec succès !`);
        fetchAccounts();
      } else if (oauthStatus === 'error') {
        toast.error(message || 'Erreur de connexion');
      }
    }
  }, [fetchAccounts]);

  return { accounts, loading, fetchAccounts };
}

export function buildGoogleAuthUrl(email?: string) {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

  if (!clientId || !supabaseUrl) return null;

  const redirectUri = `${supabaseUrl}/functions/v1/oauth-callback`;
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', GOOGLE_SCOPES);
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');
  authUrl.searchParams.set('include_granted_scopes', 'false');
  if (email) {
    authUrl.searchParams.set('login_hint', email);
  }
  return authUrl;
}
