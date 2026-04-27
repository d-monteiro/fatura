// SAF-T (PT) v1.04_01 — builder mínimo para PurchaseInvoices.
// Spec: https://info.portaldasfinancas.gov.pt/ (Portaria 302/2016 + anexos).
// Escopo V1: 1 empresa, faturas recebidas (compras). Sem WorkingDocuments
// nem Payments. Hash=0, SoftwareCertificateNumber=0 (não certificado).

export interface SaftCompany {
  nif: string;
  name: string;
  address: string | null;
  currency: string;
}

export interface SaftSupplier {
  id: string;
  nif: string | null;
  name: string;
  address: string | null;
}

export interface SaftLine {
  lineNumber: number;
  description: string;
  quantity: number;
  unit: string;
  unitPriceNet: number;
  totalNet: number;
  ivaRate: number;
}

export interface SaftInvoice {
  id: string;
  docNumber: string;
  docDate: string;          // YYYY-MM-DD
  supplierId: string;
  invoiceType: 'FT' | 'FS' | 'NC' | 'RC';  // FT=fatura, FS=fatura-recibo, NC=nota de crédito, RC=recibo
  amountNet: number;
  amountIva: number;
  amountTotal: number;
  ivaRate: number | null;
  reverseCharge: boolean;
  lines: SaftLine[];
}

export interface BuildSaftInput {
  company: SaftCompany;
  periodStart: string;
  periodEnd: string;
  suppliers: SaftSupplier[];
  invoices: SaftInvoice[];
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function n2(v: number): string {
  return v.toFixed(2);
}

function taxCode(rate: number): 'NOR' | 'INT' | 'RED' | 'ISE' {
  if (rate >= 22) return 'NOR';
  if (rate >= 12) return 'INT';
  if (rate > 0) return 'RED';
  return 'ISE';
}

function periodFromDate(iso: string): number {
  return parseInt(iso.slice(5, 7), 10);
}

function buildHeader(company: SaftCompany, start: string, end: string): string {
  const fiscalYear = start.slice(0, 4);
  const today = new Date().toISOString().slice(0, 10);
  return `<Header>
    <AuditFileVersion>1.04_01</AuditFileVersion>
    <CompanyID>${esc(company.nif)}</CompanyID>
    <TaxRegistrationNumber>${esc(company.nif)}</TaxRegistrationNumber>
    <TaxAccountingBasis>F</TaxAccountingBasis>
    <CompanyName>${esc(company.name)}</CompanyName>
    ${company.address ? `<CompanyAddress><AddressDetail>${esc(company.address)}</AddressDetail><City>Desconhecido</City><PostalCode>0000-000</PostalCode><Country>PT</Country></CompanyAddress>` : '<CompanyAddress><AddressDetail>Desconhecido</AddressDetail><City>Desconhecido</City><PostalCode>0000-000</PostalCode><Country>PT</Country></CompanyAddress>'}
    <FiscalYear>${fiscalYear}</FiscalYear>
    <StartDate>${start}</StartDate>
    <EndDate>${end}</EndDate>
    <CurrencyCode>${esc(company.currency || 'EUR')}</CurrencyCode>
    <DateCreated>${today}</DateCreated>
    <TaxEntity>Global</TaxEntity>
    <ProductCompanyTaxID>${esc(company.nif)}</ProductCompanyTaxID>
    <SoftwareCertificateNumber>0</SoftwareCertificateNumber>
    <ProductID>FaturaAI/Flowzi</ProductID>
    <ProductVersion>1.0</ProductVersion>
  </Header>`;
}

function buildSupplier(s: SaftSupplier): string {
  const nif = s.nif && /^\d{9}$/.test(s.nif.replace(/\s/g, '')) ? s.nif.replace(/\s/g, '') : '999999990';
  return `<Supplier>
    <SupplierID>${esc(s.id)}</SupplierID>
    <AccountID>Desconhecido</AccountID>
    <SupplierTaxID>${esc(nif)}</SupplierTaxID>
    <CompanyName>${esc(s.name)}</CompanyName>
    <BillingAddress>
      <AddressDetail>${esc(s.address ?? 'Desconhecido')}</AddressDetail>
      <City>Desconhecido</City>
      <PostalCode>0000-000</PostalCode>
      <Country>PT</Country>
    </BillingAddress>
    <SelfBillingIndicator>0</SelfBillingIndicator>
  </Supplier>`;
}

function buildTaxTable(rates: number[]): string {
  const entries = rates.map((r) => {
    const code = taxCode(r);
    return `<TaxTableEntry>
      <TaxType>IVA</TaxType>
      <TaxCountryRegion>PT</TaxCountryRegion>
      <TaxCode>${code}</TaxCode>
      <Description>IVA ${r}%</Description>
      <TaxPercentage>${n2(r)}</TaxPercentage>
    </TaxTableEntry>`;
  }).join('\n');
  return `<TaxTable>${entries}</TaxTable>`;
}

function buildLine(line: SaftLine): string {
  const code = taxCode(line.ivaRate);
  return `<Line>
    <LineNumber>${line.lineNumber}</LineNumber>
    <ProductCode>GENERICO</ProductCode>
    <ProductDescription>${esc((line.description || 'Item').slice(0, 200))}</ProductDescription>
    <Quantity>${line.quantity || 1}</Quantity>
    <UnitOfMeasure>${esc(line.unit || 'UN')}</UnitOfMeasure>
    <UnitPrice>${n2(line.unitPriceNet)}</UnitPrice>
    <TaxBase>${n2(line.totalNet)}</TaxBase>
    <Description>${esc((line.description || 'Item').slice(0, 200))}</Description>
    <DebitAmount>${n2(line.totalNet)}</DebitAmount>
    <Tax>
      <TaxType>IVA</TaxType>
      <TaxCountryRegion>PT</TaxCountryRegion>
      <TaxCode>${code}</TaxCode>
      <TaxPercentage>${n2(line.ivaRate)}</TaxPercentage>
    </Tax>
  </Line>`;
}

function buildInvoice(inv: SaftInvoice, companyNif: string): string {
  const lines = inv.lines.length > 0
    ? inv.lines.map((l) => buildLine(l)).join('\n')
    : buildLine({
        lineNumber: 1,
        description: 'Fatura ' + inv.docNumber,
        quantity: 1,
        unit: 'UN',
        unitPriceNet: inv.amountNet,
        totalNet: inv.amountNet,
        ivaRate: inv.ivaRate ?? 0,
      });

  const period = periodFromDate(inv.docDate);
  const systemEntry = `${inv.docDate}T00:00:00`;

  return `<Invoice>
    <InvoiceNo>${esc(inv.docNumber)}</InvoiceNo>
    <DocumentStatus>
      <InvoiceStatus>N</InvoiceStatus>
      <InvoiceStatusDate>${systemEntry}</InvoiceStatusDate>
      <SourceID>${esc(companyNif)}</SourceID>
      <SourceBilling>I</SourceBilling>
    </DocumentStatus>
    <Hash>0</Hash>
    <HashControl>1</HashControl>
    <Period>${period}</Period>
    <InvoiceDate>${inv.docDate}</InvoiceDate>
    <InvoiceType>${inv.invoiceType}</InvoiceType>
    <SpecialRegimes>
      <SelfBillingIndicator>0</SelfBillingIndicator>
      <CashVATSchemeIndicator>0</CashVATSchemeIndicator>
      <ThirdPartiesBillingIndicator>0</ThirdPartiesBillingIndicator>
    </SpecialRegimes>
    <SourceID>${esc(companyNif)}</SourceID>
    <SystemEntryDate>${systemEntry}</SystemEntryDate>
    <SupplierID>${esc(inv.supplierId)}</SupplierID>
    ${lines}
    <DocumentTotals>
      <TaxPayable>${n2(inv.amountIva)}</TaxPayable>
      <NetTotal>${n2(inv.amountNet)}</NetTotal>
      <GrossTotal>${n2(inv.amountTotal)}</GrossTotal>
    </DocumentTotals>
  </Invoice>`;
}

export function buildSaftXml(input: BuildSaftInput): string {
  const { company, periodStart, periodEnd, suppliers, invoices } = input;

  const suppliersXml = suppliers.map(buildSupplier).join('\n');
  const rateSet = new Set<number>();
  invoices.forEach((inv) => {
    if (inv.ivaRate !== null) rateSet.add(inv.ivaRate);
    inv.lines.forEach((l) => rateSet.add(l.ivaRate));
  });
  const rates = [...rateSet].sort((a, b) => b - a);
  if (rates.length === 0) rates.push(23);
  const taxTable = buildTaxTable(rates);

  const invoicesXml = invoices.map((inv) => buildInvoice(inv, company.nif)).join('\n');
  const totalCredit = invoices.reduce((s, inv) => s + inv.amountNet, 0);

  return `<?xml version="1.0" encoding="UTF-8"?>
<AuditFile xmlns="urn:OECD:StandardAuditFile-Tax:PT_1.04_01">
  ${buildHeader(company, periodStart, periodEnd)}
  <MasterFiles>
    ${suppliersXml}
    ${taxTable}
  </MasterFiles>
  <SourceDocuments>
    <PurchaseInvoices>
      <NumberOfEntries>${invoices.length}</NumberOfEntries>
      <TotalDebit>0.00</TotalDebit>
      <TotalCredit>${n2(totalCredit)}</TotalCredit>
      ${invoicesXml}
    </PurchaseInvoices>
  </SourceDocuments>
</AuditFile>`;
}

export function inferInvoiceType(documentType: string | null): SaftInvoice['invoiceType'] {
  if (documentType === 'nota_credito') return 'NC';
  if (documentType === 'recibo') return 'RC';
  return 'FT';
}
