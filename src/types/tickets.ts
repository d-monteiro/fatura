export type TicketCategory = 'general' | 'bug' | 'feature' | 'billing' | 'integration';
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TicketStatus = 'open' | 'in_progress' | 'waiting_customer' | 'resolved' | 'closed';

export interface Ticket {
  id: string;
  created_at: string;
  updated_at: string;

  tenant_id: string;
  user_id: string;

  subject: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;

  resolved_at: string | null;
  resolved_by: string | null;
  resolution_notes: string | null;

  slack_thread_ts: string | null;
  slack_channel_id: string | null;

  browser_info: Record<string, unknown> | null;
  page_url: string | null;
  screenshot_url: string | null;

  satisfaction_score: number | null;
  satisfaction_comment: string | null;
}

export interface TicketMessage {
  id: string;
  created_at: string;
  ticket_id: string;
  user_id: string | null;

  content: string;
  is_internal: boolean;
  is_from_admin: boolean;

  attachments: { name: string; url: string; size: number; type: string }[] | null;
}

export interface ErrorLog {
  id: string;
  created_at: string;

  tenant_id: string | null;
  user_id: string | null;

  level: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  source: 'frontend' | 'edge_function' | 'cron' | 'webhook';
  function_name: string | null;

  message: string;
  stack_trace: string | null;

  request_id: string | null;
  http_method: string | null;
  http_path: string | null;
  http_status: number | null;

  metadata: Record<string, unknown> | null;

  resolved: boolean;
  resolved_at: string | null;
  resolved_by: string | null;
}
