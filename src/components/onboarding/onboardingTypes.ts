export const SECTORS = [
  { value: 'construction', label: 'Construção Civil' },
  { value: 'commerce', label: 'Comércio / Retalho' },
  { value: 'services', label: 'Serviços / Consultoria' },
  { value: 'restauration', label: 'Restauração / Hotelaria' },
  { value: 'transport', label: 'Transporte / Logística' },
  { value: 'sante', label: 'Saúde / Médico' },
  { value: 'technologie', label: 'Tecnologia / TI' },
  { value: 'immobilier', label: 'Imobiliário' },
  { value: 'agriculture', label: 'Agricultura' },
  { value: 'autre', label: 'Outro' },
] as const;

export const EU_COUNTRIES = [
  { value: 'PT', label: 'Portugal' },
  { value: 'ES', label: 'Espanha' },
  { value: 'DE', label: 'Alemanha' },
  { value: 'IT', label: 'Itália' },
  { value: 'BE', label: 'Bélgica' },
  { value: 'NL', label: 'Países Baixos' },
  { value: 'LU', label: 'Luxemburgo' },
  { value: 'CH', label: 'Suíça' },
  { value: 'AT', label: 'Áustria' },
  { value: 'IE', label: 'Irlanda' },
  { value: 'PL', label: 'Polónia' },
  { value: 'RO', label: 'Roménia' },
  { value: 'GR', label: 'Grécia' },
] as const;

export const CATEGORY_TEMPLATES: Record<string, { metiers: string[]; natures: string[]; cost_types: string[] }> = {
  construction: {
    metiers: ['Eletricidade', 'Canalização', 'Aquecimento', 'Estuque', 'Alvenaria', 'Pintura', 'Carpintaria'],
    natures: ['Materiais', 'Subempreiteiros', 'Aluguer de equipamento', 'Combustível', 'Alimentação', 'Seguros'],
    cost_types: ['Custos fixos', 'Custos variáveis'],
  },
  commerce: {
    metiers: [],
    natures: ['Mercadorias', 'Embalagem', 'Transporte', 'Marketing', 'Renda', 'Seguros'],
    cost_types: ['Custos fixos', 'Custos variáveis'],
  },
  services: {
    metiers: [],
    natures: ['Subcontratação', 'Software/SaaS', 'Deslocações', 'Formação', 'Renda', 'Seguros'],
    cost_types: ['Custos fixos', 'Custos variáveis'],
  },
  restauration: {
    metiers: [],
    natures: ['Alimentação', 'Bebidas', 'Equipamento de cozinha', 'Energia', 'Renda', 'Seguros'],
    cost_types: ['Custos fixos', 'Custos variáveis'],
  },
  transport: {
    metiers: [],
    natures: ['Combustível', 'Manutenção de veículos', 'Portagens', 'Seguros', 'Leasing', 'Peças'],
    cost_types: ['Custos fixos', 'Custos variáveis'],
  },
  technologie: {
    metiers: [],
    natures: ['Software/SaaS', 'Alojamento', 'Hardware', 'Subcontratação', 'Formação', 'Seguros'],
    cost_types: ['Custos fixos', 'Custos variáveis'],
  },
};

export const DOCUMENT_TYPES = [
  { value: 'factures', label: 'Faturas' },
  { value: 'recus', label: 'Recibos' },
  { value: 'avoirs', label: 'Notas de crédito' },
  { value: 'devis', label: 'Orçamentos' },
] as const;

export const FOLDER_TEMPLATES = [
  { value: 'year_type', label: 'Ano > Tipo de custo', example: 'FATURAS/2026/Custos fixos/...' },
  { value: 'year_month', label: 'Ano > Mês', example: 'FATURAS/2026/01 - Janeiro/...' },
  { value: 'year_supplier', label: 'Ano > Fornecedor', example: 'FATURAS/2026/FORNECEDOR/...' },
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
  logoDataUrl: string | null; // base64 data URL stored in localStorage during onboarding

  // Block 2: Invoice Intelligence
  invoiceNameVariations: string[];
  invoicesPerMonth: number;
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
  country: 'PT',
  sector: '',
  sectorCustom: '',
  primaryColor: '#0E2435',
  secondaryColor: '#BBB388',
  logoDataUrl: null,

  invoiceNameVariations: [],
  invoicesPerMonth: 100,
  documentTypes: ['factures'],

  storageProvider: 'google_drive',
  folderStructure: 'year_month',
  autoSheets: true,

  currency: 'EUR',
  autoReports: 'never',

  emailSync: false,
  emailAddresses: [],

  selectedPlan: '',
  billingCycle: 'monthly',
};
