import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

const steps = [
  {
    n: '01',
    title: 'Responda 6 perguntas sobre a sua empresa',
    body: 'Categorias que usa, fornecedores mais comuns, estrutura do Drive. 5 minutos, zero jargão técnico.',
  },
  {
    n: '02',
    title: 'A IA configura o seu espaço',
    body: 'Categorias pré-definidas, pastas Drive criadas, prompts ajustados à sua realidade de PME portuguesa.',
  },
  {
    n: '03',
    title: 'Envia faturas e esquece',
    body: 'Upload manual ou sync do Gmail. A IA extrai NIF, IVA, total, data e arquiva ao sítio certo.',
  },
];

export function HowItWorks() {
  return (
    <section id="como-funciona" className="relative border-y border-border bg-card py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <div className="max-w-2xl">
          <div className="inline-flex items-center rounded-full border border-border bg-background px-3 py-1 text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
            Como funciona
          </div>
          <h2 className="mt-6 text-4xl font-bold leading-[1.05] tracking-tighter text-primary md:text-5xl">
            De caos a automático, em 3 passos.
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
            Sem configuração técnica. Sem contabilidade avançada. Só o essencial.
          </p>
        </div>

        <ol className="mt-16 grid gap-10 md:grid-cols-3">
          {steps.map((s) => (
            <li key={s.n} className="relative border-t-2 border-accent/40 pt-6">
              <div className="font-mono text-sm font-medium text-accent">Passo {s.n}</div>
              <h3 className="mt-4 text-xl font-semibold leading-tight tracking-tight text-primary">
                {s.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {s.body}
              </p>
            </li>
          ))}
        </ol>

        <div className="mt-16 flex flex-col items-start justify-between gap-4 border-t border-border pt-8 sm:flex-row sm:items-center">
          <p className="text-base text-primary">
            <span className="font-semibold">7 dias grátis.</span>{' '}
            <span className="text-muted-foreground">Sem cartão. Cancele sem pagar nada.</span>
          </p>
          <Link
            to="/onboarding"
            className="group inline-flex items-center gap-2 text-base font-semibold text-primary"
          >
            Começar a minha configuração
            <ArrowRight className="h-4 w-4 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-1" />
          </Link>
        </div>
      </div>
    </section>
  );
}
