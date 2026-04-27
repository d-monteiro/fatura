import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Calendar, Check, ChevronRight, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { useCompanyFilter } from '@/hooks/useCompanyFilter';
import { queryKeys, invalidateInvoiceLists } from '@/lib/queryKeys';
import { formatEUR, formatDatePT } from '@/lib/utils/validation';
import { setInvoicePaid } from '@/lib/invoices/markAsPaid';
import type { Invoice } from '@/types/database';

const WINDOW_DAYS = 30;
const ROW_LIMIT = 8;

type InvoiceRow = Pick<Invoice, 'id' | 'supplier_name' | 'doc_number' | 'data_vencimento' | 'valor_total'>;
type Row = InvoiceRow & { daysLeft: number | null };

export function UpcomingPaymentsWidget() {
  const { tenant } = useTenant();
  const { companyId } = useCompanyFilter();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const tenantId = tenant?.id ?? null;

  const { data: rows = [], isLoading } = useQuery({
    queryKey: queryKeys.upcomingPayments(tenantId, companyId),
    enabled: !!tenantId,
    queryFn: async (): Promise<Row[]> => {
      const today = new Date();
      const todayMs = today.getTime();
      const until = new Date(todayMs + WINDOW_DAYS * 24 * 60 * 60 * 1000);
      let q = supabase.from('invoices')
        .select('id, supplier_name, doc_number, data_vencimento, valor_total')
        .eq('tenant_id', tenantId!)
        .is('deleted_at', null)
        .is('paid_at', null)
        .not('data_vencimento', 'is', null)
        .gte('data_vencimento', today.toISOString().slice(0, 10))
        .lte('data_vencimento', until.toISOString().slice(0, 10))
        .order('data_vencimento', { ascending: true })
        .limit(ROW_LIMIT);
      if (companyId) q = q.eq('company_id', companyId);
      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as InvoiceRow[]).map((r) => ({
        ...r,
        daysLeft: r.data_vencimento
          ? Math.ceil((new Date(r.data_vencimento).getTime() - todayMs) / (24 * 60 * 60 * 1000))
          : null,
      }));
    },
  });

  const markPaid = useMutation({
    mutationFn: (invoiceId: string) => setInvoicePaid(invoiceId, true),
    onSuccess: () => {
      toast.success('Fatura marcada como paga.');
      invalidateInvoiceLists(qc);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Erro a marcar como paga'),
  });

  const total = useMemo(() => rows.reduce((s, r) => s + (r.valor_total ?? 0), 0), [rows]);

  if (isLoading) {
    return <div className="h-40 animate-pulse rounded-2xl bg-gray-100" />;
  }
  if (rows.length === 0) return null;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-card">
      <header className="flex items-center justify-between border-b border-gray-100 px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2.5">
          <div className="rounded-lg bg-blue-100 p-1.5 text-blue-600">
            <Calendar className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 sm:text-base">
              A pagar nos próximos {WINDOW_DAYS} dias
            </h3>
            <p className="text-xs text-gray-500">
              {rows.length} {rows.length === 1 ? 'fatura' : 'faturas'} · {formatEUR(total)}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => navigate('/invoices')}
          className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900"
        >
          Ver todas <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </header>

      <ul className="divide-y divide-gray-100">
        {rows.map((r) => <PaymentRow key={r.id} row={r} onPay={() => markPaid.mutate(r.id)} disabled={markPaid.isPending} />)}
      </ul>
    </div>
  );
}

function PaymentRow({ row, onPay, disabled }: { row: Row; onPay: () => void; disabled: boolean }) {
  const daysLeft = row.daysLeft;
  const urgent = daysLeft !== null && daysLeft <= 3;

  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-900">{row.supplier_name ?? 'Sem fornecedor'}</p>
        <p className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
          {row.doc_number && <span className="font-mono">{row.doc_number}</span>}
          <span className={urgent ? 'inline-flex items-center gap-1 font-medium text-amber-700' : ''}>
            {urgent && <AlertCircle className="h-3 w-3" />}
            {formatDatePT(row.data_vencimento)}
            {daysLeft !== null && <span className="ml-1 text-gray-400">({daysLeft === 0 ? 'hoje' : `${daysLeft}d`})</span>}
          </span>
        </p>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className="font-semibold text-gray-900 tabular-nums">{formatEUR(row.valor_total)}</span>
        <button
          type="button"
          onClick={onPay}
          disabled={disabled}
          className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-green-700 disabled:opacity-50"
        >
          <Check className="h-3.5 w-3.5" />
          Pago
        </button>
      </div>
    </li>
  );
}
