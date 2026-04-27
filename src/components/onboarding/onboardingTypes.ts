import type { BillingCycle } from '@/types/billing';

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
  { value: 'outro', label: 'Outro' },
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

// Templates de categorias por sector. is_fixed marca categorias com
// comportamento de custo fixo (substitui o antigo cost_type).
export interface CategoryTemplate { label: string; is_fixed?: boolean }

export const CATEGORY_TEMPLATES: Record<string, CategoryTemplate[]> = {
  construction: [
    { label: 'Materiais' },
    { label: 'Subempreiteiros' },
    { label: 'Aluguer de equipamento' },
    { label: 'Combustível' },
    { label: 'Alimentação' },
    { label: 'Seguros', is_fixed: true },
    { label: 'Eletricidade' },
    { label: 'Canalização' },
    { label: 'Aquecimento' },
    { label: 'Estuque' },
    { label: 'Alvenaria' },
    { label: 'Pintura' },
    { label: 'Carpintaria' },
  ],
  commerce: [
    { label: 'Mercadorias' },
    { label: 'Embalagem' },
    { label: 'Transporte' },
    { label: 'Marketing' },
    { label: 'Renda', is_fixed: true },
    { label: 'Seguros', is_fixed: true },
  ],
  services: [
    { label: 'Subcontratação' },
    { label: 'Software / SaaS', is_fixed: true },
    { label: 'Deslocações' },
    { label: 'Formação' },
    { label: 'Renda', is_fixed: true },
    { label: 'Seguros', is_fixed: true },
  ],
  restauration: [
    { label: 'Alimentação' },
    { label: 'Bebidas' },
    { label: 'Equipamento de cozinha' },
    { label: 'Energia', is_fixed: true },
    { label: 'Renda', is_fixed: true },
    { label: 'Seguros', is_fixed: true },
  ],
  transport: [
    { label: 'Combustível' },
    { label: 'Manutenção de veículos' },
    { label: 'Portagens' },
    { label: 'Seguros', is_fixed: true },
    { label: 'Leasing', is_fixed: true },
    { label: 'Peças' },
  ],
  technologie: [
    { label: 'Software / SaaS', is_fixed: true },
    { label: 'Alojamento', is_fixed: true },
    { label: 'Hardware' },
    { label: 'Subcontratação' },
    { label: 'Formação' },
    { label: 'Seguros', is_fixed: true },
  ],
};

export const DOCUMENT_TYPES = [
  { value: 'fatura', label: 'Faturas' },
  { value: 'recibo', label: 'Recibos' },
  { value: 'nota_credito', label: 'Notas de crédito' },
  { value: 'orcamento', label: 'Orçamentos' },
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
  reportEmail: string;

  // Block 5: Automation
  emailSync: boolean;
  emailAddresses: string[];

  // Step 7: Plan
  selectedPlan: string;
  billingCycle: BillingCycle;
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
  documentTypes: ['fatura'],

  storageProvider: 'google_drive',
  folderStructure: 'year_month',
  autoSheets: true,

  currency: 'EUR',
  autoReports: 'never',
  reportEmail: '',

  emailSync: false,
  emailAddresses: [],

  selectedPlan: '',
  billingCycle: 'monthly',
};
