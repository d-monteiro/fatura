import { Trash2, ShieldCheck } from 'lucide-react';
import { formatEUR, formatDatePT } from '@/lib/utils/validation';
import type { Invoice, PotentialDuplicateRow } from '@/types/database';

interface Props {
  pair: PotentialDuplicateRow;
  invoiceA: Invoice;
  invoiceB: Invoice;
  onDismiss: () => void;
  onMarkDuplicate: (duplicateId: string) => void;
  onInspect: (invoice: Invoice) => void;
  disabled?: boolean;
}

const LABEL: Record<PotentialDuplicateRow['match_kind'], string> = {
  doc_number: 'Mesmo nº de documento + fornecedor',
  amount_date: 'Mesmo fornecedor, data e total',
};

export function DuplicatePairCard({
  pair, invoiceA, invoiceB, onDismiss, onMarkDuplicate, onInspect, disabled,
}: Props) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
          {LABEL[pair.match_kind]}
        </span>
        <button
          type="button"
          onClick={onDismiss}
          disabled={disabled}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          Manter ambos
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <InvoiceSide
          label="A"
          invoice={invoiceA}
          onInspect={() => onInspect(invoiceA)}
          onMarkDuplicate={() => onMarkDuplicate(invoiceA.id)}
          disabled={disabled}
        />
        <InvoiceSide
          label="B"
          invoice={invoiceB}
          onInspect={() => onInspect(invoiceB)}
          onMarkDuplicate={() => onMarkDuplicate(invoiceB.id)}
          disabled={disabled}
        />
      </div>
    </div>
  );
}

interface SideProps {
  label: 'A' | 'B';
  invoice: Invoice;
  onInspect: () => void;
  onMarkDuplicate: () => void;
  disabled?: boolean;
}

function InvoiceSide({ label, invoice, onInspect, onMarkDuplicate, disabled }: SideProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
          Fatura {label}
        </span>
        <span className="font-mono text-[11px] text-gray-400">{invoice.id.slice(0, 8)}</span>
      </div>
      <dl className="space-y-1.5 text-sm">
        <Row label="Fornecedor" value={invoice.supplier_name ?? '—'} />
        <Row label="Nº doc." value={invoice.doc_number ?? '—'} />
        <Row label="Data" value={formatDatePT(invoice.doc_date)} />
        <Row label="Total" value={formatEUR(invoice.valor_total)} bold />
        <Row label="Criada" value={formatDatePT(invoice.created_at.slice(0, 10))} muted />
      </dl>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onInspect}
          className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
        >
          Ver detalhe
        </button>
        <button
          type="button"
          onClick={onMarkDuplicate}
          disabled={disabled}
          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Marcar como duplicado
        </button>
      </div>
    </div>
  );
}

function Row({ label, value, bold, muted }: { label: string; value: string; bold?: boolean; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className={`text-right ${bold ? 'font-semibold text-gray-900' : muted ? 'text-xs text-gray-500' : 'text-gray-800'}`}>
        {value}
      </dd>
    </div>
  );
}
