// Tenant-aware Gemini prompt builder (Deno).
// Single source of truth — frontend NÃO importa daqui (Edge Function constrói o prompt).

export interface TenantAIConfig {
  companyName: string;
  nif: string;
  sector: string;
  language: 'pt' | 'fr' | 'en';
  country: string;
  currency: string;
  nameVariations: string[];
  vatRates: number[];
  costTypes: { code: string; label: string }[];
  metiers: { code: string; label: string }[];
  natures: { code: string; label: string }[];
  knownSuppliers: { normalized: string; variations: string[] }[];
  documentTypes: string[];
}

const DEFAULT_VAT_RATES: Record<string, number[]> = {
  PT: [23, 13, 6, 0],
  FR: [20, 10, 5.5, 2.1, 0],
  ES: [21, 10, 4, 0],
  IT: [22, 10, 4, 0],
  DE: [19, 7, 0],
  BE: [21, 12, 6, 0],
  NL: [21, 9, 0],
  LU: [17, 14, 8, 3, 0],
};

export function getVatRatesForCountry(country: string): number[] {
  return DEFAULT_VAT_RATES[country?.toUpperCase()] ?? DEFAULT_VAT_RATES.PT;
}

const I18N: Record<string, Record<string, string>> = {
  pt: {
    role: 'És um CONTABILISTA SÉNIOR especializado em',
    objective: 'OBJETIVO',
    objectiveBody: 'Processar imagens/PDFs de faturas e devolver um JSON estruturado. Se um PDF contém VÁRIAS faturas (números diferentes), extrai CADA fatura separadamente.',
    company: 'IDENTIFICAÇÃO DA EMPRESA',
    companyBody: (c: TenantAIConfig) =>
      `- NIF: ${c.nif}\n- A empresa aparece em faturas como: ${c.nameVariations.join(', ')}\n- Se o documento for EMITIDO POR esta empresa (e não recebido), retorna is_valid_document: false com rejection_reason: "pas_une_facture_fournisseur".`,
    validation: 'VALIDAÇÃO INICIAL',
    validationBody: '1. Não é documento (selfie, foto pessoal, paisagem) → is_valid_document: false, rejection_reason: "pas_un_document"\n2. Documento ilegível/desfocado → is_valid_document: false, rejection_reason: "document_illisible"\n3. Documento mas não fatura/recibo/nota crédito → is_valid_document: false, rejection_reason: "pas_une_facture"\n4. Senão → is_valid_document: true.',
    classify: 'REGRAS DE CLASSIFICAÇÃO',
    types: 'Tipos de custo',
    metiers: 'Especialidades / Métiers',
    natures: 'Natureza da despesa',
    suppliers: 'Fornecedores conhecidos (normalização de nomes)',
    extract: 'EXTRAÇÃO DE DADOS',
    output: 'FORMATO DE SAÍDA (APENAS JSON)',
  },
  fr: {
    role: 'Tu es un COMPTABLE SENIOR spécialisé dans le secteur',
    objective: 'OBJECTIF',
    objectiveBody: 'Traiter des images/PDFs de factures et renvoyer un JSON structuré. Si le PDF contient PLUSIEURS factures (numéros différents), extraire CHAQUE facture séparément.',
    company: 'IDENTIFICATION DE L\'ENTREPRISE',
    companyBody: (c: TenantAIConfig) =>
      `- NIF/SIRET: ${c.nif}\n- L'entreprise apparaît sur les factures comme: ${c.nameVariations.join(', ')}\n- Si le document est ÉMIS PAR cette entreprise (et non reçu), retourner is_valid_document: false avec rejection_reason: "pas_une_facture_fournisseur".`,
    validation: 'VALIDATION INITIALE',
    validationBody: '1. Pas un document → is_valid_document: false, rejection_reason: "pas_un_document"\n2. Illisible → "document_illisible"\n3. Document mais pas une facture → "pas_une_facture"\n4. Sinon → is_valid_document: true.',
    classify: 'RÈGLES DE CLASSIFICATION',
    types: 'Types de coût',
    metiers: 'Métiers',
    natures: 'Nature de la dépense',
    suppliers: 'Fournisseurs connus (normalisation)',
    extract: 'EXTRACTION DE DONNÉES',
    output: 'FORMAT DE SORTIE (JSON UNIQUEMENT)',
  },
  en: {
    role: 'You are a SENIOR ACCOUNTANT specialised in',
    objective: 'OBJECTIVE',
    objectiveBody: 'Process invoice images/PDFs and return structured JSON. If the PDF contains MULTIPLE invoices (different numbers), extract EACH invoice separately.',
    company: 'COMPANY IDENTIFICATION',
    companyBody: (c: TenantAIConfig) =>
      `- VAT/Tax ID: ${c.nif}\n- The company appears on invoices as: ${c.nameVariations.join(', ')}\n- If the document is ISSUED BY this company (not received), return is_valid_document: false with rejection_reason: "pas_une_facture_fournisseur".`,
    validation: 'INITIAL VALIDATION',
    validationBody: '1. Not a document → is_valid_document: false, rejection_reason: "pas_un_document"\n2. Illegible/blurry → "document_illisible"\n3. Document but not invoice/receipt/credit-note → "pas_une_facture"\n4. Otherwise → is_valid_document: true.',
    classify: 'CLASSIFICATION RULES',
    types: 'Cost types',
    metiers: 'Trades / Specialties',
    natures: 'Expense nature',
    suppliers: 'Known suppliers (name normalisation)',
    extract: 'DATA EXTRACTION',
    output: 'OUTPUT FORMAT (JSON ONLY)',
  },
};

export function buildTenantPrompt(c: TenantAIConfig): string {
  const t = I18N[c.language] ?? I18N.pt;
  const parts: string[] = [];

  parts.push(`# ${t.role} ${c.sector}.\nProcessas faturas de fornecedores para a empresa "${c.companyName}".`);
  parts.push(`# ${t.objective}\n${t.objectiveBody}`);
  parts.push(`# ${t.company}\n${t.companyBody(c)}`);
  parts.push(`# ${t.validation}\n${t.validationBody}`);

  parts.push(`# ${t.classify}

## ${t.types}:
${c.costTypes.map((x) => `- "${x.code}": ${x.label}`).join('\n')}

## ${t.metiers}:
${c.metiers.length ? c.metiers.map((x) => `- "${x.code}": ${x.label}`).join('\n') : '- (não aplicável a este sector — usar null)'}

## ${t.natures}:
${c.natures.map((x) => `- "${x.code}": ${x.label}`).join('\n')}`);

  if (c.knownSuppliers.length) {
    parts.push(`## ${t.suppliers}:
${c.knownSuppliers.map((s) => `- ${s.variations.map((v) => `"${v}"`).join(' ou ')} → "${s.normalized}"`).join('\n')}`);
  }

  parts.push(`# ${t.extract}
- Moeda: ${c.currency}
- País: ${c.country}
- Formato datas: YYYY-MM-DD
- Taxas IVA possíveis: ${c.vatRates.join(', ')}%
- Se autoliquidação (subempreitada): IVA = 0%, autoliquidation: true
- Montantes em formato numérico (1234.56, sem espaços/vírgulas)
- supplier_name: nome do FORNECEDOR em MAIÚSCULAS (quem emite)
- destinataire_name: nome do destinatário (quem recebe)
- Tipos de documento aceites: ${c.documentTypes.join(', ')}`);

  parts.push(`# ${t.output}
Devolve APENAS este objeto JSON, sem markdown nem texto antes/depois.
SEMPRE retorna { "invoices": [...] }, mesmo que seja uma só fatura.

{
  "invoices": [
    {
      "is_valid_document": boolean,
      "rejection_reason": "pas_un_document" | "document_illisible" | "pas_une_facture" | "pas_une_facture_fournisseur" | null,
      "document_type": "facture" | "avoir" | "recu" | "devis" | "autre" | null,
      "cost_type": ${c.costTypes.map((x) => `"${x.code}"`).join(' | ') || 'string'} | null,
      "metier": ${c.metiers.length ? c.metiers.map((x) => `"${x.code}"`).join(' | ') + ' | null' : 'null'},
      "nature_depense": ${c.natures.map((x) => `"${x.code}"`).join(' | ') || 'string'} | null,
      "doc_year": number | null,
      "doc_date": "YYYY-MM-DD" | null,
      "date_echeance": "YYYY-MM-DD" | null,
      "supplier_name": string | null,
      "destinataire_name": string | null,
      "supplier_nif": string | null,
      "doc_number": string | null,
      "montant_ht": number | null,
      "taux_tva": number | null,
      "montant_tva": number | null,
      "montant_ttc": number | null,
      "autoliquidation": boolean,
      "payment_method": "CB" | "virement" | "cheque" | "especes" | "transferencia" | "MB" | null,
      "supplier_iban": string | null,
      "summary": string | null,
      "confidence_score": number,
      "line_items": [
        { "description": string | null, "quantity": number | null, "unit": string | null, "unit_price_ht": number | null, "total_ht": number | null, "taux_tva": number | null }
      ]
    }
  ]
}

Se is_valid_document = false, os outros campos podem ser null.`);

  return parts.join('\n\n');
}
