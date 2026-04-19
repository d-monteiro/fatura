import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { ArrowRight, Sparkles } from 'lucide-react';

export function CTA() {
  return (
    <section className="relative overflow-hidden bg-primary text-primary-foreground">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 right-0 h-[500px] w-[500px] translate-x-1/4 rounded-full bg-accent/20 blur-3xl" />
        <div className="absolute -bottom-20 left-0 h-[400px] w-[400px] -translate-x-1/4 rounded-full bg-accent/10 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: 'radial-gradient(white 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }}
        />
      </div>

      <div className="relative mx-auto max-w-5xl px-6 py-28 text-center md:py-40">
        <div className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.22em] text-accent">
          <Sparkles className="h-3 w-3" strokeWidth={2} />
          Último passo
        </div>

        <h2 className="mt-6 text-4xl font-bold leading-[1.02] tracking-tighter sm:text-5xl md:text-[72px]">
          Dê 5 minutos.
          <br />
          <span className="text-accent">Ganhe o mês todo.</span>
        </h2>

        <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-primary-foreground/70 md:text-xl">
          7 dias de acesso completo, sem pedir cartão. Se não ajudar, não paga.
          Se ajudar, já não vai querer voltar ao Excel.
        </p>

        <div className="mt-10 inline-flex flex-col items-center gap-4 sm:flex-row">
          <Button
            asChild
            className="group h-16 rounded-full bg-accent pl-8 pr-2 text-base font-medium text-accent-foreground shadow-[0_20px_40px_-10px_rgba(187,179,136,0.4)] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-[2px] hover:shadow-[0_25px_50px_-10px_rgba(187,179,136,0.5)]"
          >
            <Link to="/onboarding" className="inline-flex items-center gap-4">
              Começar os meus 7 dias grátis
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-1">
                <ArrowRight className="!h-5 !w-5" />
              </span>
            </Link>
          </Button>
        </div>

        <div className="mt-10 flex flex-wrap justify-center gap-x-8 gap-y-3 text-sm text-primary-foreground/60">
          <span className="inline-flex items-center gap-2">
            <span className="h-1 w-1 rounded-full bg-accent" />
            Sem cartão de crédito
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-1 w-1 rounded-full bg-accent" />
            Configurado em 5 minutos
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-1 w-1 rounded-full bg-accent" />
            Cancele quando quiser, sem pagar nada
          </span>
        </div>
      </div>
    </section>
  );
}
