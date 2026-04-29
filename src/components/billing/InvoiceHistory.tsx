import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, ExternalLink, FileText, Loader2 } from 'lucide-react';
import { queryKeys } from '@/lib/queryKeys';

interface InvoiceSummary {
  id: string;
  number: string | null;
  created: number;
  amount_paid: number;
  amount_due: number;
  currency: string;
  status: string | null;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
  period_start: number | null;
  period_end: number | null;
}

const STATUS_LABEL: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  paid: { label: 'Pago', variant: 'default' },
  open: { label: 'Em aberto', variant: 'secondary' },
  draft: { label: 'Rascunho', variant: 'outline' },
  uncollectible: { label: 'Incobrável', variant: 'destructive' },
  void: { label: 'Anulada', variant: 'outline' },
};

function formatCents(cents: number, currency: string): string {
  const value = cents / 100;
  try {
    return new Intl.NumberFormat('pt-PT', {
      style: 'currency',
      currency: currency.toUpperCase(),
      minimumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency.toUpperCase()}`;
  }
}

function formatDate(unix: number): string {
  return new Date(unix * 1000).toLocaleDateString('pt-PT');
}

async function fetchInvoices(): Promise<InvoiceSummary[]> {
  const { data, error } = await supabase.functions.invoke<{ invoices: InvoiceSummary[] }>(
    'stripe-invoices',
    { method: 'GET' },
  );
  if (error) throw new Error(error.message || 'Falha ao obter faturas Stripe');
  return data?.invoices ?? [];
}

export function InvoiceHistory() {
  const { tenant } = useTenant();
  const hasCustomer = !!tenant?.stripe_customer_id;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: queryKeys.stripeInvoices(tenant?.id ?? null),
    queryFn: fetchInvoices,
    enabled: hasCustomer,
    staleTime: 60_000,
  });

  if (!hasCustomer) return null;

  return (
    <section className="rounded-2xl border bg-background p-6 md:p-8 space-y-4">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Histórico de faturas</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Últimas 12 faturas Stripe.</p>
        </div>
      </header>

      {isLoading && (
        <div className="flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          A carregar faturas…
        </div>
      )}

      {isError && (
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : 'Erro ao obter faturas.'}
        </p>
      )}

      {!isLoading && !isError && (data?.length ?? 0) === 0 && (
        <p className="text-sm text-muted-foreground py-6 text-center border rounded-lg bg-muted/30">
          Ainda não há faturas Stripe associadas a esta conta.
        </p>
      )}

      {!isLoading && data && data.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {data.map((inv) => {
            const status = inv.status ? STATUS_LABEL[inv.status] : null;
            const paid = inv.amount_paid > 0 ? inv.amount_paid : inv.amount_due;
            return (
              <li key={inv.id} className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-4">
                <div className="flex items-start gap-3 min-w-0">
                  <FileText className="h-4 w-4 text-muted-foreground mt-1 shrink-0" />
                  <div className="min-w-0">
                    <div className="font-mono text-sm font-medium truncate">{inv.number ?? inv.id}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {formatDate(inv.created)}
                      {inv.period_start && inv.period_end && (
                        <span> · período {formatDate(inv.period_start)} – {formatDate(inv.period_end)}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 md:gap-4 shrink-0">
                  <span className="font-mono tabular-nums text-sm">{formatCents(paid, inv.currency)}</span>
                  {status && <Badge variant={status.variant}>{status.label}</Badge>}
                  <div className="flex items-center gap-1">
                    {inv.hosted_invoice_url && (
                      <Button asChild variant="ghost" size="sm" className="h-8 px-2">
                        <a href={inv.hosted_invoice_url} target="_blank" rel="noopener noreferrer" aria-label="Ver no Stripe">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </Button>
                    )}
                    {inv.invoice_pdf && (
                      <Button asChild variant="ghost" size="sm" className="h-8 px-2">
                        <a href={inv.invoice_pdf} target="_blank" rel="noopener noreferrer" aria-label="Descarregar PDF">
                          <Download className="h-3.5 w-3.5" />
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
