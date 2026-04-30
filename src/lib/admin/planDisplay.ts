// Mapping de PlanStatus interno (Stripe-fiel) → 4 estados user-facing usados
// no admin. O dropdown só permite escolher estes 4. Estados extra (`paused`,
// `pending_contact`) continuam a existir na BD via fluxos próprios — `paused`
// vem do botão "Suspender", `pending_contact` é definido pelo signup enterprise.
import type { PlanStatus } from '@/types/tenant';

export type PlanDisplayState = 'trial' | 'active' | 'overdue' | 'cancelled';

export const PLAN_DISPLAY_LABEL: Record<PlanDisplayState, string> = {
  trial: 'Em prova',
  active: 'Ativo',
  overdue: 'Em atraso',
  cancelled: 'Cancelado',
};

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';

export const PLAN_DISPLAY_VARIANT: Record<PlanDisplayState, BadgeVariant> = {
  trial: 'secondary',
  active: 'default',
  overdue: 'destructive',
  cancelled: 'outline',
};

export function getPlanDisplayState(status: PlanStatus | string | null | undefined): PlanDisplayState {
  switch (status) {
    case 'trialing':
    case 'pending_contact':
      return 'trial';
    case 'active':
      return 'active';
    case 'past_due':
      return 'overdue';
    case 'canceled':
    case 'paused':
      return 'cancelled';
    default:
      return 'cancelled';
  }
}

// Quando o admin escolhe um dos 4 estados no dropdown, traduzimos para o
// PlanStatus canónico que vai escrito em `tenants.plan_status`. `paused` é
// reservado ao botão "Suspender" — não é destino deste mapping.
export function planStatusFromDisplay(display: PlanDisplayState): PlanStatus {
  switch (display) {
    case 'trial':
      return 'trialing';
    case 'active':
      return 'active';
    case 'overdue':
      return 'past_due';
    case 'cancelled':
      return 'canceled';
  }
}

export const PLAN_DISPLAY_OPTIONS: { value: PlanDisplayState; label: string }[] = [
  { value: 'trial', label: PLAN_DISPLAY_LABEL.trial },
  { value: 'active', label: PLAN_DISPLAY_LABEL.active },
  { value: 'overdue', label: PLAN_DISPLAY_LABEL.overdue },
  { value: 'cancelled', label: PLAN_DISPLAY_LABEL.cancelled },
];
