import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { ArrowRight, FileText, CheckCircle2, Zap } from 'lucide-react';

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-background via-background to-primary/5">
      {/* Decorative blobs */}
      <div className="absolute top-20 -left-20 h-64 w-64 rounded-full bg-primary/20 blur-3xl opacity-60 animate-pulse" />
      <div className="absolute bottom-10 -right-20 h-80 w-80 rounded-full bg-accent/30 blur-3xl opacity-50" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />

      {/* Grid pattern overlay */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

      <div className="relative mx-auto max-w-6xl px-4 py-24 sm:py-32 lg:py-40">
        <div className="flex flex-col items-center text-center">
          {/* Headline */}
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight max-w-4xl leading-[1.05]">
            As suas faturas,{' '}
            <span className="relative inline-block">
              <span className="relative z-10 bg-gradient-to-r from-primary via-primary to-accent bg-clip-text text-transparent">
                sem esforço
              </span>
              <svg
                className="absolute -bottom-2 left-0 w-full"
                viewBox="0 0 300 12"
                fill="none"
                preserveAspectRatio="none"
              >
                <path
                  d="M2 8C75 3 150 3 298 8"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  className="text-accent"
                />
              </svg>
            </span>
          </h1>

          {/* Sub-headline */}
          <p className="mt-8 text-lg sm:text-xl text-muted-foreground max-w-2xl leading-relaxed">
            A IA lê, categoriza e organiza todas as faturas dos seus fornecedores.
            Chega de folhas de cálculo manuais.
          </p>

          {/* Single CTA */}
          <div className="mt-10">
            <Button asChild size="lg" className="h-14 px-8 text-base shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all">
              <Link to="/onboarding" className="inline-flex items-center whitespace-nowrap gap-2">
                Começar grátis · 7 dias
                <ArrowRight className="h-5 w-5" />
              </Link>
            </Button>
            <p className="mt-3 text-xs text-muted-foreground">
              Sem cartão de crédito · Configuração em 5 minutos
            </p>
          </div>

          {/* Visual mock preview */}
          <div className="relative mt-20 w-full max-w-4xl">
            <div className="absolute -inset-4 bg-gradient-to-r from-primary/20 via-accent/20 to-primary/20 rounded-3xl blur-2xl opacity-50" />
            <div className="relative rounded-2xl border bg-card/80 backdrop-blur-xl shadow-2xl overflow-hidden">
              {/* Mock header bar */}
              <div className="flex items-center gap-2 px-4 py-3 border-b bg-muted/30">
                <div className="flex gap-1.5">
                  <div className="h-3 w-3 rounded-full bg-red-400" />
                  <div className="h-3 w-3 rounded-full bg-yellow-400" />
                  <div className="h-3 w-3 rounded-full bg-green-400" />
                </div>
                <div className="ml-4 text-xs text-muted-foreground font-mono">faturas.flowzi.pt/dashboard</div>
              </div>

              {/* Mock dashboard content */}
              <div className="grid md:grid-cols-3 gap-4 p-6">
                <MetricCard icon={FileText} label="Faturas este mês" value="247" trend="+12%" />
                <MetricCard icon={Zap} label="Processadas por IA" value="100%" trend="automático" />
                <MetricCard icon={CheckCircle2} label="Tempo poupado" value="38h" trend="este mês" />
              </div>

              <div className="px-6 pb-6">
                <div className="rounded-lg border bg-background/50 p-4 space-y-2">
                  {[
                    { supplier: 'EDP COMERCIAL', amount: '342,18 EUR', category: 'Eletricidade' },
                    { supplier: 'NOS COMUNICAÇÕES', amount: '89,50 EUR', category: 'Telecomunicações' },
                    { supplier: 'STAPLES', amount: '156,70 EUR', category: 'Escritório' },
                  ].map((inv, i) => (
                    <div key={i} className="flex items-center justify-between py-2 text-sm border-b last:border-b-0">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-8 w-8 rounded bg-primary/10 flex items-center justify-center shrink-0">
                          <FileText className="h-4 w-4 text-primary" />
                        </div>
                        <div className="flex items-baseline gap-2 min-w-0">
                          <span className="font-medium truncate">{inv.supplier}</span>
                          <span className="text-xs text-muted-foreground truncate">· {inv.category}</span>
                        </div>
                      </div>
                      <div className="font-mono font-medium shrink-0">{inv.amount}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function MetricCard({ icon: Icon, label, value, trend }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  trend: string;
}) {
  return (
    <div className="rounded-xl border bg-background/50 p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-primary mt-1">{trend}</div>
    </div>
  );
}
