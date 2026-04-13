/**
 * FaturaAI - Tenant-Aware AI Prompt Builder
 * Generates dynamic prompts for Gemini based on tenant configuration.
 */

export interface TenantAIConfig {
  companyName: string;
  nif: string;
  sector: string;
  nameVariations: string[];
  currency: string;
  dateFormat: string;
  vatRates: number[];
  costTypes: { code: string; label: string; description?: string }[];
  categories: { code: string; label: string }[];
  metiers?: { code: string; label: string }[];
  knownSuppliers: { normalized: string; variations: string[] }[];
}

const DEFAULT_VAT_RATES: Record<string, number[]> = {
  FR: [20, 10, 5.5, 2.1, 0],
  PT: [23, 13, 6, 0],
  DE: [19, 7, 0],
  ES: [21, 10, 4, 0],
  IT: [22, 10, 4, 0],
  BE: [21, 12, 6, 0],
};

export function getVatRatesForCountry(country: string): number[] {
  return DEFAULT_VAT_RATES[country] ?? DEFAULT_VAT_RATES.FR;
}

export function buildTenantPrompt(config: TenantAIConfig): string {
  const parts: string[] = [];

  parts.push(`# RÔLE
Tu es un COMPTABLE SENIOR spécialisé dans le secteur ${config.sector}.
Tu traites des images/PDFs de factures fournisseurs pour l'entreprise "${config.companyName}".`);

  parts.push(`# IDENTIFICATION DE L'ENTREPRISE
- NIF/VAT: ${config.nif}
- L'entreprise apparaît sur les factures comme: ${config.nameVariations.join(', ')}
- Si le document est ÉMIS PAR cette entreprise (et non reçu), retourner is_valid_document: false avec rejection_reason: "pas_une_facture_fournisseur".`);

  parts.push(`# VALIDATION INITIALE
Vérifie d'abord si le document est un document comptable valide:
1. Si ce n'est pas un document (photo personnelle, capture d'écran...) → is_valid_document: false, rejection_reason: "pas_un_document"
2. Si le document est illisible/trop flou → is_valid_document: false, rejection_reason: "document_illisible"
3. Si c'est un document mais pas une facture/reçu/avoir/devis → is_valid_document: false, rejection_reason: "pas_une_facture"
4. Sinon → is_valid_document: true, analyser le document.`);

  // Classification rules
  parts.push(`# RÈGLES DE CLASSIFICATION

## Type de coût:
${config.costTypes.map((ct) => `- "${ct.code}": ${ct.label}${ct.description ? ` — ${ct.description}` : ''}`).join('\n')}

## Catégories de dépenses:
${config.categories.map((cat) => `- "${cat.code}": ${cat.label}`).join('\n')}`);

  if (config.metiers && config.metiers.length > 0) {
    parts.push(`## Métiers / Spécialités:
${config.metiers.map((m) => `- "${m.code}": ${m.label}`).join('\n')}`);
  }

  if (config.knownSuppliers.length > 0) {
    parts.push(`## Fournisseurs connus (normalisation des noms):
${config.knownSuppliers.map((s) => `- "${s.variations.join('" ou "')}" → "${s.normalized}"`).join('\n')}`);
  }

  parts.push(`# EXTRACTION DE DONNÉES
- Devise: ${config.currency}
- Format dates: ${config.dateFormat}
- Taux TVA possibles: ${config.vatRates.join(', ')}%
- Si autoliquidation (sous-traitance): TVA = 0%, mettre autoliquidation: true
- Montants: toujours en format numérique (1234.56, pas "1 234,56")`);

  parts.push(`# FORMAT DE SORTIE
Retourne un objet JSON valide (pas de markdown, pas de \\\`\\\`\\\`json):
{
  "is_valid_document": boolean,
  "rejection_reason": "pas_un_document" | "document_illisible" | "pas_une_facture" | null,
  "document_type": "facture" | "avoir" | "recu" | "autre" | null,
  "cost_type": string | null,
  "metier": string | null,
  "nature_depense": string | null,
  "doc_year": number | null,
  "doc_date": "YYYY-MM-DD" | null,
  "date_echeance": "YYYY-MM-DD" | null,
  "supplier_name": "NOM EN MAJUSCULES" | null,
  "supplier_siret": string | null,
  "doc_number": string | null,
  "destinataire_name": string | null,
  "montant_ht": number | null,
  "taux_tva": number | null,
  "montant_tva": number | null,
  "montant_ttc": number | null,
  "autoliquidation": boolean,
  "payment_method": string | null,
  "supplier_iban": string | null,
  "summary": "Max 5 mots" | null,
  "confidence_score": 0.0-1.0,
  "line_items": [
    {
      "description": string | null,
      "quantity": number | null,
      "unit": string | null,
      "unit_price_ht": number | null,
      "total_ht": number | null,
      "taux_tva": number | null
    }
  ]
}`);

  return parts.join('\n\n');
}

/**
 * Build AI config from onboarding data and tenant settings.
 */
export function buildAIConfigFromOnboarding(onboardingData: {
  companyName: string;
  nif: string;
  sector: string;
  country: string;
  invoiceNameVariations: string[];
  categories: string[];
  topSuppliers: string[];
  currency: string;
}): TenantAIConfig {
  const vatRates = getVatRatesForCountry(onboardingData.country);

  return {
    companyName: onboardingData.companyName,
    nif: onboardingData.nif,
    sector: onboardingData.sector,
    nameVariations: onboardingData.invoiceNameVariations.length > 0
      ? onboardingData.invoiceNameVariations
      : [onboardingData.companyName.toUpperCase()],
    currency: onboardingData.currency,
    dateFormat: 'DD/MM/YYYY',
    vatRates,
    costTypes: [
      { code: 'cout_fixe', label: 'Coûts fixes', description: 'Loyers, assurances, abonnements' },
      { code: 'cout_variable', label: 'Coûts variables', description: 'Matériaux, sous-traitance, consommables' },
    ],
    categories: onboardingData.categories.map((cat) => ({
      code: cat.toLowerCase().replace(/[^a-z0-9]/g, '_'),
      label: cat,
    })),
    knownSuppliers: onboardingData.topSuppliers.map((s) => ({
      normalized: s.toUpperCase(),
      variations: [s],
    })),
  };
}
