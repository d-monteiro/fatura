/**
 * Frontend wrapper for the `slack-notify` edge function.
 * Silent-fail: if Slack is not configured or errors out, we log and move on —
 * the UX must never break because of a missing notification.
 *
 * The edge function runs without JWT verification so it can also be called
 * during anonymous onboarding (before the account is created).
 */

import { supabase } from '@/lib/supabase/client';

type LeadPayload = {
  company_name: string;
  contact_name: string;
  email: string;
  phone?: string;
  sector?: string;
  country?: string;
  invoices_per_month?: number;
  availability?: string;
  notes?: string;
};

type TicketPayload = {
  tenant_name: string;
  plan_name?: string;
  subject: string;
  category: string;
  priority: string;
  email: string;
  description: string;
  ticket_id: string;
};

type AlertPayload = {
  level: 'info' | 'warn' | 'error' | 'fatal';
  source: string;
  function_name?: string;
  message: string;
};

type SignupPayload = {
  tenant_name: string;
  plan_name: string;
  email: string;
  country?: string;
};

type NotifyArgs =
  | { channel: 'leads' | 'lead'; payload: LeadPayload }
  | { channel: 'tickets' | 'ticket'; payload: TicketPayload }
  | { channel: 'alerts' | 'alert'; payload: AlertPayload }
  | { channel: 'signups' | 'signup'; payload: SignupPayload };

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export async function notifySlack(args: NotifyArgs): Promise<void> {
  if (!SUPABASE_URL || !ANON_KEY) return;
  try {
    // Use the session token if available, otherwise fall back to the anon key.
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ?? ANON_KEY;

    await fetch(`${SUPABASE_URL}/functions/v1/slack-notify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': ANON_KEY,
      },
      body: JSON.stringify(args),
    });
  } catch (e) {
    console.warn('[slack] notify failed silently:', e);
  }
}
