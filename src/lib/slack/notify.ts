/**
 * Frontend wrapper for the `slack-notify` edge function.
 * Silent-fail: if Slack is not configured or errors out, we log and move on —
 * the UX must never break because of a missing notification.
 *
 * A edge function exige JWT de user válido (ver supabase/functions/slack-notify/index.ts),
 * por isso fazemos skip se a sessão ainda não estiver propagada em vez de mandar
 * um request com o ANON_KEY (gera 401 no console).
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
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;

    await fetch(`${SUPABASE_URL}/functions/v1/slack-notify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': ANON_KEY,
      },
      body: JSON.stringify(args),
    });
  } catch (e) {
    console.warn('[slack] notify failed silently:', e);
  }
}
