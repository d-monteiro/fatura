import type { Metier, NatureDepense, CostType, InvoiceStatus } from '@/types/database';

export const METIERS: readonly Metier[] = [
  'electricite', 'plomberie', 'chauffage', 'platrerie', 'autre',
] as const;

export const NATURES: readonly NatureDepense[] = [
  'materiaux', 'sous_traitants', 'location_materiel', 'restauration',
  'carburant', 'atelier', 'assurances', 'comptabilite',
  'fournitures_bureau', 'autre',
] as const;

export const COST_TYPES: readonly CostType[] = ['cout_fixe', 'cout_variable'] as const;

export const INVOICE_STATUSES: readonly InvoiceStatus[] = [
  'pending', 'inbox', 'processed', 'review',
] as const;

export const COST_TYPE_LABELS: Record<CostType, string> = {
  cout_fixe: 'Fixo',
  cout_variable: 'Variável',
};
