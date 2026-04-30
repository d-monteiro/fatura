import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, RotateCcw } from 'lucide-react';
import { setInvoicePaid } from '@/lib/invoices/markAsPaid';
import { invalidateInvoiceLists } from '@/lib/queryKeys';
import { formatDatePT } from '@/lib/utils/validation';
import { useRole } from '@/hooks/useRole';
import type { Invoice } from '@/types/database';

interface Props {
  invoice: Invoice;
}

export function InvoicePaymentStatus({ invoice }: Props) {
  const qc = useQueryClient();
  const { can } = useRole();
  const canMarkPaid = can('mark_paid');
  const isPaid = !!invoice.paid_at;

  const mutation = useMutation({
    mutationKey: ['invoice-paid', invoice.id],
    mutationFn: (paid: boolean) => setInvoicePaid(invoice.id, paid),
    onSuccess: (_, paid) => {
      invalidateInvoiceLists(qc);
      toast.success(paid ? 'Fatura marcada como paga.' : 'Fatura marcada como por pagar.');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Erro a atualizar pagamento'),
  });

  return (
    <div className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${isPaid ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`}>
      <div>
        <p className={`font-medium ${isPaid ? 'text-green-800' : 'text-amber-900'}`}>
          {isPaid ? 'Paga' : 'Por pagar'}
        </p>
        {isPaid && invoice.paid_at && (
          <p className="text-xs text-green-700">em {formatDatePT(invoice.paid_at.slice(0, 10))}</p>
        )}
        {!isPaid && invoice.data_vencimento && (
          <p className="text-xs text-amber-700">vence {formatDatePT(invoice.data_vencimento)}</p>
        )}
      </div>
      {canMarkPaid && (
        <button
          type="button"
          onClick={() => mutation.mutate(!isPaid)}
          disabled={mutation.isPending}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 ${isPaid ? 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50' : 'bg-green-600 text-white hover:bg-green-700'}`}
        >
          {isPaid ? <><RotateCcw className="h-3.5 w-3.5" /> Desmarcar</> : <><Check className="h-3.5 w-3.5" /> Marcar pago</>}
        </button>
      )}
    </div>
  );
}
