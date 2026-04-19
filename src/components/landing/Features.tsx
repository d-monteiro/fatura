import { Brain, FolderTree, Inbox, BarChart3, Shield, Building2, Sparkles, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

type FeatureProps = {
  className?: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  desc: string;
  variant?: 'dark' | 'accent';
  tag?: string;
};

export function Features() {
  return (
    <section id="funcionalidades" className="py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <div className="max-w-2xl">
          <div className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1 text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
            O que faz por si
          </div>
          <h2 className="mt-6 text-4xl font-bold leading-[1.05] tracking-tighter text-primary md:text-5xl">
            Menos cliques. Mais faturas tratadas.
          </h2>
        </div>

        <div className="mt-14 grid gap-4 md:grid-cols-6">
          <Feature
            className="md:col-span-4"
            icon={Brain}
            title="A nossa IA proprietária lê cada fatura."
            desc="Extrai NIF, IVA, total, data e fornecedor com mais de 95% de precisão. Processa PDF, JPG e HEIC do iPhone."
            variant="dark"
            tag="IA nativa"
          />
          <Feature
            className="md:col-span-2"
            icon={Inbox}
            title="Sync com Gmail"
            desc="Faturas em anexo detetadas automaticamente todas as noites."
          />
          <Feature
            className="md:col-span-2"
            icon={FolderTree}
            title="Drive organizado"
            desc="Arquiva por pasta, ano e fornecedor segundo as regras que definir."
          />
          <Feature
            className="md:col-span-2"
            icon={BarChart3}
            title="Dashboards prontos"
            desc="Categoria, fornecedor, tendência mensal. Export Excel em 1 clique."
          />
          <Feature
            className="md:col-span-2"
            icon={Building2}
            title="Multi-empresa"
            desc="Gira várias empresas no mesmo espaço. Ideal para holdings e contabilistas."
          />
          <Feature
            className="md:col-span-6"
            icon={Shield}
            title="Os seus dados ficam seus."
            desc="Isolamento por tenant, encriptação at rest, dados alojados na Europa. Conformidade RGPD garantida."
            variant="accent"
          />
        </div>

        <div className="mt-14 flex flex-col items-start justify-between gap-4 border-t border-border pt-8 sm:flex-row sm:items-center">
          <p className="max-w-lg text-base text-primary">
            Experimente tudo, gratuitamente, durante 7 dias. Sem cartão.
          </p>
          <Link
            to="/onboarding"
            className="group inline-flex items-center gap-2 text-base font-semibold text-primary"
          >
            Começar agora
            <ArrowRight className="h-4 w-4 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-1" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function Feature({ className = '', icon: Icon, title, desc, variant, tag }: FeatureProps) {
  const dark = variant === 'dark';
  const accent = variant === 'accent';
  const base = dark
    ? 'bg-primary border-primary text-primary-foreground'
    : accent
      ? 'bg-accent/10 border-accent/30 text-primary'
      : 'bg-card border-border text-primary hover:border-primary/30';

  return (
    <div
      className={`group relative flex flex-col rounded-2xl border p-6 transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-[2px] md:p-8 ${base} ${className}`}
    >
      {tag && (
        <div className={`mb-6 inline-flex w-max items-center gap-2 rounded-full px-3 py-1 text-[10px] font-medium uppercase tracking-[0.2em] ${dark ? 'bg-accent/20 text-accent' : 'bg-accent/15 text-accent'}`}>
          <Sparkles className="h-3 w-3" strokeWidth={2} />
          {tag}
        </div>
      )}
      <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${dark ? 'bg-accent text-accent-foreground' : accent ? 'bg-accent/20 text-primary' : 'bg-primary/5 text-primary'}`}>
        <Icon className="h-5 w-5" strokeWidth={1.8} />
      </div>
      <h3 className={`mt-5 text-xl font-semibold leading-tight tracking-tight ${dark ? 'text-primary-foreground' : 'text-primary'}`}>
        {title}
      </h3>
      <p className={`mt-2 text-sm leading-relaxed ${dark ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
        {desc}
      </p>
    </div>
  );
}
