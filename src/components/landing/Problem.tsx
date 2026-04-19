import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

const pains = [
  {
    before: 'Abrir cada email, guardar cada PDF à mão, renomear ficheiros.',
    after: 'Chega no Gmail, aparece classificada no Drive em segundos.',
  },
  {
    before: 'Folhas de Excel desactualizadas, totais errados, fim-de-mês caótico.',
    after: 'Dashboard em tempo real por categoria e fornecedor.',
  },
  {
    before: 'Perder 2h por semana a lançar manualmente fornecedor a fornecedor.',
    after: 'Zero lançamento manual. A IA extrai NIF, IVA e total.',
  },
  {
    before: 'Entregar ao contabilista uma pasta revolta a cada trimestre.',
    after: 'Export Excel organizado, pronto em 1 clique.',
  },
];

export function Problem() {
  return (
    <section className="relative py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <div className="max-w-2xl">
          <div className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1 text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
            Porquê o FaturaAI
          </div>
          <h2 className="mt-6 text-4xl font-bold leading-[1.05] tracking-tighter text-primary md:text-5xl">
            Reconhece-se nisto?
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
            Cada fatura de fornecedor devia ser automática, mas ainda custa tempo e atenção.
          </p>
        </div>

        <div className="mt-14 border-y border-border">
          {pains.map((p, i) => (
            <div
              key={i}
              className="grid gap-4 border-t border-border py-6 first:border-t-0 md:grid-cols-[auto_1fr_1fr] md:items-center md:gap-10 md:py-8"
            >
              <div className="font-mono text-xs text-muted-foreground md:w-10">
                0{i + 1}
              </div>
              <div className="text-base text-muted-foreground line-through decoration-destructive/40 decoration-2 md:pr-10">
                {p.before}
              </div>
              <div className="text-base font-medium leading-snug text-primary">
                {p.after}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-col items-start gap-5 sm:flex-row sm:items-center">
          <Button
            asChild
            className="group h-14 rounded-full bg-primary py-2 pl-7 pr-2 text-base font-medium text-primary-foreground transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-[1px]"
          >
            <Link to="/onboarding" className="inline-flex items-center gap-3">
              Experimentar 7 dias grátis
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-accent-foreground transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-0.5">
                <ArrowRight className="!h-4 !w-4" />
              </span>
            </Link>
          </Button>
          <p className="text-sm text-muted-foreground">
            Configuração em 5 min · Sem cartão · Cancele sem pagar nada
          </p>
        </div>
      </div>
    </section>
  );
}
