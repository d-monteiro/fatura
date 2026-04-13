export const SECTORS = [
  { value: 'construction', label: 'Construction / BTP' },
  { value: 'commerce', label: 'Commerce / Retail' },
  { value: 'services', label: 'Services / Consulting' },
  { value: 'restauration', label: 'Restauration / Hôtellerie' },
  { value: 'transport', label: 'Transport / Logistique' },
  { value: 'sante', label: 'Santé / Médical' },
  { value: 'technologie', label: 'Technologie / IT' },
  { value: 'immobilier', label: 'Immobilier' },
  { value: 'agriculture', label: 'Agriculture' },
  { value: 'autre', label: 'Autre' },
] as const;

export const EU_COUNTRIES = [
  { value: 'FR', label: 'France' },
  { value: 'PT', label: 'Portugal' },
  { value: 'DE', label: 'Allemagne' },
  { value: 'ES', label: 'Espagne' },
  { value: 'IT', label: 'Italie' },
  { value: 'BE', label: 'Belgique' },
  { value: 'NL', label: 'Pays-Bas' },
  { value: 'LU', label: 'Luxembourg' },
  { value: 'CH', label: 'Suisse' },
  { value: 'AT', label: 'Autriche' },
  { value: 'IE', label: 'Irlande' },
  { value: 'PL', label: 'Pologne' },
  { value: 'RO', label: 'Roumanie' },
  { value: 'GR', label: 'Grèce' },
] as const;

export const CATEGORY_TEMPLATES: Record<string, { metiers: string[]; natures: string[]; cost_types: string[] }> = {
  construction: {
    metiers: ['Électricité', 'Plomberie', 'Chauffage', 'Plâtrerie', 'Maçonnerie', 'Peinture', 'Menuiserie'],
    natures: ['Matériaux', 'Sous-traitants', 'Location matériel', 'Carburant', 'Restauration', 'Assurances'],
    cost_types: ['Coûts fixes', 'Coûts variables'],
  },
  commerce: {
    metiers: [],
    natures: ['Marchandises', 'Emballage', 'Transport', 'Marketing', 'Loyer', 'Assurances'],
    cost_types: ['Coûts fixes', 'Coûts variables'],
  },
  services: {
    metiers: [],
    natures: ['Sous-traitance', 'Logiciels/SaaS', 'Déplacements', 'Formation', 'Loyer', 'Assurances'],
    cost_types: ['Coûts fixes', 'Coûts variables'],
  },
  restauration: {
    metiers: [],
    natures: ['Alimentation', 'Boissons', 'Équipement cuisine', 'Énergie', 'Loyer', 'Assurances'],
    cost_types: ['Coûts fixes', 'Coûts variables'],
  },
  transport: {
    metiers: [],
    natures: ['Carburant', 'Entretien véhicules', 'Péages', 'Assurances', 'Leasing', 'Pièces détachées'],
    cost_types: ['Coûts fixes', 'Coûts variables'],
  },
  technologie: {
    metiers: [],
    natures: ['Logiciels/SaaS', 'Hébergement', 'Matériel informatique', 'Sous-traitance', 'Formation', 'Assurances'],
    cost_types: ['Coûts fixes', 'Coûts variables'],
  },
};

export const DOCUMENT_TYPES = [
  { value: 'factures', label: 'Factures' },
  { value: 'recus', label: 'Reçus' },
  { value: 'avoirs', label: 'Avoirs' },
  { value: 'devis', label: 'Devis' },
] as const;

export const FOLDER_TEMPLATES = [
  { value: 'year_type', label: 'Année > Type de coût', example: 'FACTURES/2026/Coûts fixes/...' },
  { value: 'year_month', label: 'Année > Mois', example: 'FACTURES/2026/01 - Janvier/...' },
  { value: 'year_supplier', label: 'Année > Fournisseur', example: 'FACTURES/2026/FOURNISSEUR/...' },
] as const;

export const CURRENCIES = [
  { value: 'EUR', label: 'EUR (€)' },
  { value: 'USD', label: 'USD ($)' },
  { value: 'GBP', label: 'GBP (£)' },
  { value: 'CHF', label: 'CHF' },
] as const;

export const INVOICE_VOLUME_OPTIONS = [10, 50, 100, 200, 500, 1000] as const;

export interface OnboardingData {
  // Block 1: Company
  companyName: string;
  nif: string;
  country: string;
  sector: string;
  sectorCustom: string;
  primaryColor: string;
  secondaryColor: string;

  // Block 2: Invoice Intelligence
  invoiceNameVariations: string[];
  invoicesPerMonth: number;
  categories: string[];
  topSuppliers: string[];
  documentTypes: string[];

  // Block 3: Storage
  storageProvider: 'google_drive' | 'onedrive';
  folderStructure: string;
  autoSheets: boolean;

  // Block 4: Dashboard
  currency: string;
  autoReports: 'never' | 'weekly' | 'monthly';

  // Block 5: Automation
  emailSync: boolean;
  emailAddresses: string[];

  // Step 7: Plan
  selectedPlan: string;
  billingCycle: 'monthly' | 'yearly';
}

export const DEFAULT_ONBOARDING_DATA: OnboardingData = {
  companyName: '',
  nif: '',
  country: 'FR',
  sector: '',
  sectorCustom: '',
  primaryColor: '#0E2435',
  secondaryColor: '#BBB388',

  invoiceNameVariations: [],
  invoicesPerMonth: 100,
  categories: [],
  topSuppliers: [],
  documentTypes: ['factures'],

  storageProvider: 'google_drive',
  folderStructure: 'year_type',
  autoSheets: true,

  currency: 'EUR',
  autoReports: 'never',

  emailSync: false,
  emailAddresses: [],

  selectedPlan: '',
  billingCycle: 'monthly',
};
