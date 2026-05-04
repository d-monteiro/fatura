// Sync jobs (Fase 6/7 PLAN_HARDENING). Pedido lógico de sincronização —
// 1 activo por tenant, alimentado pelos workers stateless discover-emails,
// fetch-attachments, analyze-batch e finalize-batch.

export type SyncJobTrigger = 'cron' | 'manual' | 'backfill_3m' | 'admin';

export type SyncJobStatus =
  | 'queued'
  | 'discovering'
  | 'processing'
  | 'done'
  | 'paused_reauth'
  | 'cancelled'
  | 'error';

// Snapshot de invoices por status. Mantido pelos workers via
// refresh_sync_job_counts(). Ex.: { discovered: 12, analyzing: 340 }.
export type SyncJobCounts = Partial<Record<string, number>>;

// Linha base de sync_jobs (para banner user e polling /sync/:jobId).
export interface SyncJob {
  id: string;
  tenant_id: string;
  user_id: string | null;
  email_account_id: string | null;
  trigger: SyncJobTrigger;
  date_from: string | null;
  date_to: string | null;
  gmail_query: string;
  gmail_page_token: string | null;
  total_messages_seen: number;
  total_invoices_created: number;
  counts_by_status: SyncJobCounts;
  status: SyncJobStatus;
  error_message: string | null;
  started_at: string;
  last_heartbeat_at: string;
  completed_at: string | null;
  created_at: string;
}

// admin_get_sync_jobs: lista para tabela admin (com tenant resolvido).
export interface AdminSyncJobOverview {
  id: string;
  tenant_id: string;
  tenant_name: string | null;
  user_id: string | null;
  email_account_id: string | null;
  email_address: string | null;
  trigger: SyncJobTrigger;
  status: SyncJobStatus;
  total_messages_seen: number;
  total_invoices_created: number;
  counts_by_status: SyncJobCounts;
  error_message: string | null;
  started_at: string;
  last_heartbeat_at: string;
  completed_at: string | null;
  created_at: string;
}

// admin_get_sync_job_detail: row única com breakdown live de invoices.
export interface AdminSyncJobDetail extends AdminSyncJobOverview {
  user_email: string | null;
  date_from: string | null;
  date_to: string | null;
  gmail_query: string;
  gmail_page_token: string | null;
  invoices_breakdown: SyncJobCounts;
}

// Estados terminais (não-pickable) — usados pela UI para esconder cancelar.
export const SYNC_JOB_TERMINAL_STATUSES: ReadonlyArray<SyncJobStatus> = [
  'done',
  'cancelled',
  'error',
];

export function isSyncJobTerminal(status: SyncJobStatus): boolean {
  return SYNC_JOB_TERMINAL_STATUSES.includes(status);
}

// Estados das invoices em curso, usados para barra de progresso e ETA.
export const INVOICE_PIPELINE_STATUSES: ReadonlyArray<string> = [
  'discovered',
  'fetching',
  'analyzing',
  'extracted',
];

// Estados terminais de invoice (resultado final do pipeline). 'review' não
// é estritamente terminal — espera input do user — mas para efeitos de
// progresso conta como "saiu do pipeline automatizado".
export const INVOICE_TERMINAL_STATUSES: ReadonlyArray<string> = [
  'completed',
  'rejected',
  'duplicate',
  'failed_permanent',
  'cancelled',
  'review',
];

// Helper: somatório de invoices em pipeline activo.
export function countsActive(counts: SyncJobCounts): number {
  return INVOICE_PIPELINE_STATUSES.reduce<number>(
    (acc, key) => acc + (counts[key] ?? 0),
    0,
  );
}

// Helper: total de invoices vistas pelo job (todos os status, terminal ou não).
export function countsTotal(counts: SyncJobCounts): number {
  return Object.values(counts).reduce<number>((acc, n) => acc + (n ?? 0), 0);
}
