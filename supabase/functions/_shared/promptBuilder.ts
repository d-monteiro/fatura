// Construtor do prompt Gemini, por tenant. PT-PT apenas — categoria única.

export interface TenantAIConfig {
  companyName: string;
  nif: string;
  sector: string;
  country: string;
  currency: string;
  nameVariations: string[];
  vatRates: number[];
  categories: { code: string; label: string }[];
  knownSuppliers: { normalized: string; variations: string[] }[];
  documentTypes: string[];
}

const DEFAULT_VAT_RATES: Record<string, number[]> = {
  PT: [23, 13, 6, 0],
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

export function buildTenantPrompt(c: TenantAIConfig): string {
  const parts: string[] = [];

  parts.push(`# OBJETIVO
És um CONTABILISTA SÉNIOR especializado em "${c.sector}" em Portugal.
Processas faturas de fornecedores recebidas pela empresa "${c.companyName}".
Devolve sempre um JSON estruturado conforme o formato indicado abaixo.
Se um documento contém VÁRIAS faturas (números de documento diferentes), extrai CADA fatura como entrada separada.`);

  parts.push(`# IDENTIFICAÇÃO DA EMPRESA
- NIF: ${c.nif}
- A empresa aparece nas faturas como: ${c.nameVariations.join(", ")}
- Se o documento for EMITIDO POR esta empresa (e não recebido), devolve is_valid_document: false e rejection_reason: "fatura_propria".`);

  parts.push(`# VALIDAÇÃO INICIAL
1. Não é documento (selfie, foto pessoal, paisagem) → is_valid_document: false, rejection_reason: "nao_e_documento"
2. Documento ilegível ou desfocado → "documento_ilegivel"
3. É documento mas não fatura/recibo/nota crédito → "nao_e_fatura"
4. Caso contrário → is_valid_document: true.`);

  parts.push(`# CATEGORIA DA DESPESA
Escolhe exactamente UM dos códigos abaixo (ou null se mesmo nenhum se aplicar):
${c.categories.length
    ? c.categories.map((x) => `- "${x.code}": ${x.label}`).join("\n")
    : '- (sem categorias configuradas — devolve null)'}`);

  if (c.knownSuppliers.length) {
    parts.push(`# FORNECEDORES CONHECIDOS (normalização de nomes)
${c.knownSuppliers.map((s) => `- ${s.variations.map((v) => `"${v}"`).join(" ou ")} → "${s.normalized}"`).join("\n")}`);
  }

  parts.push(`# EXTRAÇÃO DE DADOS
- Moeda: ${c.currency}
- País: ${c.country}
- Formato de datas: YYYY-MM-DD
- Taxas de IVA possíveis: ${c.vatRates.join(", ")}%
- Se houver autoliquidação (subempreitada): IVA = 0% e autoliquidacao: true
- Montantes em formato numérico (ex.: 1234.56, sem espaços nem vírgulas)
- supplier_name: nome do FORNECEDOR em MAIÚSCULAS (quem emite a fatura)
- destinatario_nome: nome do destinatário (quem recebe — útil para identificar a empresa correcta entre as do tenant)
- Tipos de documento aceites: ${c.documentTypes.join(", ")}

## REGRAS CRÍTICAS DE IVA (não confundir colunas decorativas com base tributável)
- valor_sem_iva = base tributável (linha rotulada literalmente como "Total sem IVA", "Base tributável", "Total líquido", "Subtotal", "Valor net").
- valor_iva = montante de IVA cobrado (linha rotulada "IVA", "VAT", "Imposto").
- valor_total = total final a pagar (linha rotulada "Total a pagar", "Total da fatura", "Grand total").
- taxa_iva = percentagem (0, 6, 13, 23 em PT). Nunca uma quantia em euros.
- INVARIANTE NUMÉRICA: valor_sem_iva + valor_iva ≈ valor_total (tolerância 2 cêntimos). Se a aritmética falhar, marca confidence_score < 0.7.
- NÃO uses como base tributável linhas decorativas: "prémio comercial", "valor poupado", "desconto aplicado", "valor recomendado", "preço de tabela".
- Se taxa_iva == 0 mas valor_iva > 0 ou valor_total > valor_sem_iva → inconsistência: força confidence_score < 0.7.
- Quando o documento for de seguro/seguradora, "prémio" = montante a pagar, NÃO é base tributável diferente do valor_total.`);

  parts.push(`# FORMATO DE SAÍDA (APENAS JSON, sem markdown nem texto antes/depois)
SEMPRE devolves { "invoices": [...] }, mesmo que seja uma só fatura.

{
  "invoices": [
    {
      "is_valid_document": boolean,
      "rejection_reason": "nao_e_documento" | "documento_ilegivel" | "nao_e_fatura" | "fatura_propria" | null,
      "document_type": "fatura" | "nota_credito" | "recibo" | "outro" | null,
      "category": ${c.categories.length ? c.categories.map((x) => `"${x.code}"`).join(" | ") + " | null" : "null"},
      "doc_year": number | null,
      "doc_date": "YYYY-MM-DD" | null,
      "data_vencimento": "YYYY-MM-DD" | null,
      "supplier_name": string | null,
      "destinatario_nome": string | null,
      "supplier_nif": string | null,
      "doc_number": string | null,
      "valor_sem_iva": number | null,
      "taxa_iva": number | null,
      "valor_iva": number | null,
      "valor_total": number | null,
      "autoliquidacao": boolean,
      "payment_method": "transferencia" | "MB" | "multibanco" | "cheque" | "numerario" | "cartao" | null,
      "supplier_iban": string | null,
      "summary": string | null,
      "confidence_score": number,
      "line_items": [
        { "description": string | null, "quantity": number | null, "unit": string | null, "preco_unitario": number | null, "total_sem_iva": number | null, "taxa_iva": number | null }
      ]
    }
  ]
}

Se is_valid_document = false, os outros campos podem ser null.`);

  return parts.join("\n\n");
}
