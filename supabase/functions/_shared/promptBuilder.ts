// Construtor do prompt Gemini, por tenant. PT-PT apenas — categoria única.

export interface TenantAIConfig {
  companyName: string;
  nif: string;
  sector: string;
  country: string;
  currency: string;
  nameVariations: string[];
  vatRates: number[];
  categories: { code: string; label: string; isFixed?: boolean }[];
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

  parts.push(`# VALIDAÇÃO INICIAL (rejeitar cedo — não tentar extrair valores)
1. Não é documento (selfie, foto pessoal, paisagem) → is_valid_document: false, rejection_reason: "nao_e_documento"
2. Documento ilegível ou desfocado → "documento_ilegivel"
3. É documento mas NÃO é fatura/recibo/nota crédito/aviso pagamento → "nao_e_fatura".
   REJEITAR explicitamente (is_valid_document: false, rejection_reason: "nao_e_fatura"):
   - Nota de encomenda, encomenda, pedido, "purchase order", "order confirmation".
   - Proforma, fatura proforma, "pro forma invoice", "quotation".
   - Comprovativo / talão de pagamento, comprovativo de transferência, "wire transfer summary",
     "payment confirmation", "transfer receipt" (são prova de pagamento avulso, não fatura).
   - Extracto bancário, extracto de conta, "bank statement", "statement of account".
   - Ordem de pagamento sem detalhe (sem valor sem IVA / IVA discriminado).
   - Cartas comerciais, propostas, contratos sem montantes a pagar.
   - Encomenda online / confirmação de compra sem fatura associada.
4. Caso contrário → is_valid_document: true.`);

  parts.push(`# CATEGORIA DA DESPESA
Escolhe exactamente UM dos códigos abaixo (ou null se mesmo nenhum se aplicar).
A flag [fixo] indica que despesas desta categoria são tipicamente recorrentes mensais (default — pode ser ajustada por fatura):
${c.categories.length
    ? c.categories.map((x) => `- "${x.code}": ${x.label}${x.isFixed ? ' [fixo]' : ''}`).join("\n")
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
- supplier_nif: NIF do fornecedor. Para Portugal usa apenas os 9 dígitos (sem prefixo "PT", sem espaços). Para fornecedores estrangeiros, mantém o formato original.
- destinatario_nome: nome do destinatário (quem recebe — útil para identificar a empresa correcta entre as do tenant)
- Tipos de documento aceites neste tenant: ${c.documentTypes.join(", ")}

## TIPOS DE DOCUMENTO (regras de classificação)
- "fatura": documento principal de venda/compra (PT: "Fatura", "Factura", "Invoice").
- "recibo": prova de pagamento já efectuado (PT: "Recibo", "Receipt"). Não é fatura.
- "nota_credito": correcção a fatura emitida — valores negativos para o destinatário (PT: "Nota de Crédito", "Credit note").
- "aviso_pagamento": pré-aviso ou comunicação de débito futuro / instrução de pagamento. NÃO é fatura nem recibo (PT: "Aviso de pagamento", "Aviso de débito", "Payment notice"). Não conta como custo nos relatórios.
- "outro": qualquer outro documento financeiro não classificável acima.
Devolve sempre o tipo na lista — não inventes outros valores.

## REGRAS CRÍTICAS DE IVA (não confundir colunas decorativas com base tributável)
- valor_sem_iva = base tributável (linha rotulada literalmente como "Total sem IVA", "Base tributável", "Total líquido", "Subtotal", "Valor net").
- valor_iva = montante de IVA cobrado (linha rotulada "IVA", "VAT", "Imposto").
- valor_total = total final a pagar (linha rotulada "Total a pagar", "Total da fatura", "Grand total").
- taxa_iva = percentagem (0, 6, 13, 23 em PT). Nunca uma quantia em euros.
- INVARIANTE NUMÉRICA (caso simples, taxa única, sem outros impostos):
  valor_sem_iva + valor_iva ≈ valor_total (tolerância 2 cêntimos).
- NÃO uses como base tributável linhas decorativas: "prémio comercial", "valor poupado", "desconto aplicado", "valor recomendado", "preço de tabela".
- Se taxa_iva == 0 mas valor_iva > 0 → inconsistência: força confidence_score < 0.7.

## DOCUMENTOS COM IMPOSTOS COMPOSTOS (seguros, telecom, banca)
Muitos documentos PT têm linhas adicionais entre "sem IVA" e "total" que NÃO são IVA:
- Imposto de Selo (~9% em seguros)
- FGA — Fundo de Garantia Automóvel
- INEM — taxa do Instituto Nacional de Emergência Médica
- Encargos de fraccionamento, comissões, taxas administrativas, taxa de regulação
- Taxa Audiovisual, Contribuição Audiovisual (CAV), Imposto Especial (telecom)

Para estes documentos:
- Preenche o array "outros_impostos" com cada componente: { "nome": "Imposto de Selo", "valor": 12.34 }.
- INVARIANTE: valor_sem_iva + valor_iva + Σ(outros_impostos.valor) ≈ valor_total (tolerância 2 cêntimos).
- Se o documento não discrimina valor_sem_iva e só apresenta "prémio total" + impostos, define:
  valor_sem_iva = prémio comercial (base sobre a qual o imposto de selo é calculado),
  valor_iva = 0, taxa_iva = 0, autoliquidacao = false,
  e mete TUDO o resto em outros_impostos. valor_total = soma final a pagar.

## FATURAS COM MÚLTIPLAS TAXAS DE IVA (telecom, utilities multi-serviço)
Se o documento tem várias linhas com taxas IVA diferentes (ex.: 6% + 23%):
- Preenche "iva_breakdown" com uma entrada por taxa: { "taxa": 23, "base": 100.00, "valor": 23.00 }.
- valor_iva = Σ(iva_breakdown.valor); valor_sem_iva = Σ(iva_breakdown.base); taxa_iva = a taxa dominante (ou null se forem muito misturadas).
- INVARIANTE: Σ(iva_breakdown.base) + Σ(iva_breakdown.valor) + Σ(outros_impostos.valor) ≈ valor_total.

## SUBTIPO DO DOCUMENTO (ajuda a tolerância de validação)
Preenche "document_subtype" com um destes valores (ou null) quando reconhecível:
- "seguro" — apólices, recibos de seguro (Allianz, Fidelidade, Tranquilidade, Generali, Liberty, etc.).
- "telecom" — operadores móveis/fixos (MEO, NOS, Vodafone, NOWO, Digi).
- "utilities" — eletricidade, gás, água (EDP, Galp, Goldenergy, Iberdrola, Endesa, EPAL, AdRA).
- "banca" — comissões/extractos bancários, prestações de leasing/crédito.
- null — qualquer outro caso.`);

  parts.push(`# FORMATO DE SAÍDA (APENAS JSON, sem markdown nem texto antes/depois)
SEMPRE devolves { "invoices": [...] }, mesmo que seja uma só fatura.

{
  "invoices": [
    {
      "is_valid_document": boolean,
      "rejection_reason": "nao_e_documento" | "documento_ilegivel" | "nao_e_fatura" | "fatura_propria" | null,
      "document_type": "fatura" | "recibo" | "nota_credito" | "aviso_pagamento" | "outro" | null,
      "document_subtype": "seguro" | "telecom" | "utilities" | "banca" | null,
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
      "outros_impostos": [
        { "nome": string, "valor": number }
      ],
      "iva_breakdown": [
        { "taxa": number, "base": number, "valor": number }
      ],
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
