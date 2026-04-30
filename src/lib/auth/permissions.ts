import type { TenantRole } from '@/types/tenant';

// Matriz central de permissões por role. Espelha as RLS policies (`can_write_tenant`)
// no servidor — readonly só pode SELECT, member+ pode mutate. Owner adiciona
// gestão de equipa, empresas e billing.
export type PermissionAction =
  // Leitura
  | 'view_dashboard'
  | 'view_invoices'
  | 'view_suppliers'
  | 'view_categories'
  | 'view_business_profile'
  | 'view_billing'
  | 'view_reports'
  | 'view_team'
  | 'view_companies'
  | 'export_invoices'
  | 'view_tickets'
  // Mutações — faturas
  | 'upload_invoice'
  | 'edit_invoice'
  | 'delete_invoice'
  | 'recover_invoice'
  | 'approve_invoice'
  | 'bulk_actions'
  | 'mark_paid'
  // Mutações — settings
  | 'manage_suppliers'
  | 'manage_categories'
  | 'manage_business_profile'
  | 'manage_email_accounts'
  | 'manage_google_accounts'
  | 'manage_reports'
  | 'manage_companies'
  | 'manage_team'
  | 'manage_billing'
  // Tickets
  | 'create_ticket';

const READ_ONLY_ACTIONS: PermissionAction[] = [
  'view_dashboard',
  'view_invoices',
  'view_suppliers',
  'view_categories',
  'view_business_profile',
  'export_invoices',
  'view_tickets',
  'create_ticket',
];

const MEMBER_ACTIONS: PermissionAction[] = [
  ...READ_ONLY_ACTIONS,
  'view_billing',
  'view_reports',
  'view_companies',
  'upload_invoice',
  'edit_invoice',
  'delete_invoice',
  'recover_invoice',
  'approve_invoice',
  'bulk_actions',
  'mark_paid',
  'manage_suppliers',
  'manage_categories',
  'manage_business_profile',
  'manage_email_accounts',
  'manage_google_accounts',
  'manage_reports',
];

const OWNER_ACTIONS: PermissionAction[] = [
  ...MEMBER_ACTIONS,
  'view_team',
  'manage_companies',
  'manage_team',
  'manage_billing',
];

const PERMISSIONS: Record<TenantRole, ReadonlySet<PermissionAction>> = {
  readonly: new Set(READ_ONLY_ACTIONS),
  member: new Set(MEMBER_ACTIONS),
  owner: new Set(OWNER_ACTIONS),
};

export function can(role: TenantRole, action: PermissionAction): boolean {
  return PERMISSIONS[role].has(action);
}

export const READ_ONLY_HINT = 'Conta de consulta — sem permissão para editar';
