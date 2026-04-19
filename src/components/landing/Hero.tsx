import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { ArrowRight, FileText } from 'lucide-react';
import { track } from '@/lib/analytics/track';
import { EVENTS } from '@/lib/analytics/events';

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-40 right-0 h-[560px] w-[560px] translate-x-1/4 rounded-full bg-accent/20 blur-3xl" />
        <div className="absolute -bottom-20 left-0 h-[420px] w-[420px] -translate-x-1/4 rounded-full bg-primary/10 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.03] text-primary"
          style={{
            backgroundImage: 'radial-gradient(currentColor 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }}
        />
      </div>

      <div className="mx-auto grid max-w-7xl gap-16 px-6 py-20 md:py-28 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-12 lg:py-32">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.22em] text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            7 dias grátis · sem cartão de crédito
          </div>

          <h1 className="mt-6 text-[40px] font-bold leading-[1.02] tracking-tighter text-primary sm:text-5xl lg:text-[64px]">
            As suas faturas, automáticas.
          </h1>

          <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            A IA lê, categoriza e arquiva tudo no seu Google Drive. Configurado em 5 minutos.
          </p>

          <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button
              asChild
              className="group h-14 rounded-full bg-primary py-2 pl-7 pr-2 text-base font-medium text-primary-foreground shadow-[0_10px_30px_-10px_rgba(14,36,53,0.4)] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-[1px] hover:shadow-[0_15px_40px_-10px_rgba(14,36,53,0.5)] active:translate-y-0"
            >
              <Link
                to="/onboarding"
                onClick={() => track(EVENTS.LANDING_CTA_CLICKED, { location: 'hero' })}
                className="inline-flex items-center gap-3"
              >
                Começar os meus 7 dias grátis
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-accent-foreground transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-0.5">
                  <ArrowRight className="!h-4 !w-4" />
                </span>
              </Link>
            </Button>

            <a
              href="#como-funciona"
              className="inline-flex h-14 items-center justify-center px-2 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
            >
              Ver como funciona
              <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          </div>

          <dl className="mt-10 grid max-w-lg grid-cols-3 gap-4">
            {[
              ['Sem cartão', 'na adesão'],
              ['5 min', 'a configurar'],
              ['Cancele', 'sem pagar nada'],
            ].map(([top, bot]) => (
              <div key={top} className="border-l-2 border-accent/40 pl-3">
                <dt className="text-sm font-semibold text-primary">{top}</dt>
                <dd className="text-xs text-muted-foreground">{bot}</dd>
              </div>
            ))}
          </dl>
        </div>

        <HeroMock />
      </div>
    </section>
  );
}

function HeroMock() {
  const invoices = [
    { s: 'EDP COMERCIAL', c: 'Eletricidade', a: '342,18 EUR', t: 'Hoje' },
    { s: 'NOS COMUNICAÇÕES', c: 'Telecomunicações', a: '89,50 EUR', t: 'Hoje' },
    { s: 'STAPLES', c: 'Escritório', a: '156,70 EUR', t: 'Ontem' },
    { s: 'GALP ENERGIA', c: 'Combustível', a: '74,30 EUR', t: 'Ontem' },
  ];

  return (
    <div className="relative">
      <div className="relative rounded-[28px] border border-border bg-card p-2 shadow-[0_40px_80px_-30px_rgba(14,36,53,0.25)]">
        <div className="overflow-hidden rounded-[22px] bg-background">
          <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
            <div className="flex gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-zinc-300" />
              <span className="h-2.5 w-2.5 rounded-full bg-zinc-300" />
              <span className="h-2.5 w-2.5 rounded-full bg-zinc-300" />
            </div>
            <span className="font-mono text-[10px] text-muted-foreground">fatura.flowzi.pt</span>
            <span className="w-8" />
          </div>

          <div className="grid grid-cols-3 divide-x divide-border/60 border-b border-border/60">
            <Kpi label="Este mês" value="247" hint="+12%" />
            <Kpi label="Por IA" value="100%" hint="auto" />
            <Kpi label="Tempo" value="38h" hint="poupadas" />
          </div>

          <ul className="divide-y divide-border/50">
            {invoices.map((inv, i) => (
              <li
                key={inv.s}
                className="flex items-center gap-4 px-5 py-3.5 text-sm animate-fade-in-up"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/15">
                  <FileText className="h-4 w-4 text-primary" strokeWidth={1.8} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-primary">{inv.s}</div>
                  <div className="truncate text-xs text-muted-foreground">{inv.c} · {inv.t}</div>
                </div>
                <span className="font-mono text-sm font-medium text-primary">{inv.a}</span>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-2 border-t border-border/60 px-5 py-3 text-xs text-muted-foreground">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inset-0 animate-ping rounded-full bg-primary/40" />
              <span className="relative h-1.5 w-1.5 rounded-full bg-primary" />
            </span>
            A sincronizar Gmail · 3 novas faturas detetadas
          </div>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="p-4">
      <div className="text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-2xl font-semibold tracking-tighter text-primary">{value}</div>
      <div className="text-[10px] text-accent">{hint}</div>
    </div>
  );
}
