import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { Check, Sparkles } from 'lucide-react';

const STEPS = [
  {
    title: 'Pedido recebido',
    description: 'A sua submissão chegou à nossa equipa e está a ser analisada.',
  },
  {
    title: 'Contacto em 24 horas úteis',
    description: 'Um especialista vai ligar-lhe para alinhar objetivos e requisitos.',
  },
  {
    title: 'Demo e setup personalizado',
    description: 'Agendamos uma sessão curta para ver a plataforma em ação e desenhar a vossa configuração.',
  },
];

export default function OnboardingThanks() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-60"
        style={{
          background:
            'radial-gradient(60rem 30rem at 50% -10%, rgba(14,36,53,0.08), transparent 60%), radial-gradient(40rem 20rem at 100% 100%, rgba(187,179,136,0.12), transparent 60%)',
        }}
      />

      <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-6 py-10">
        <header className="flex items-center justify-between">
          <Link to="/" className="text-lg font-bold tracking-tight text-primary">
            FaturaAI
          </Link>
          <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Plano Empresarial
          </span>
        </header>

        <main className="flex flex-1 flex-col justify-center py-16">
          <div className="animate-fade-in-up">
            <div className="mx-auto mb-8 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg animate-scale-in">
              <Check className="h-6 w-6" strokeWidth={2.5} />
            </div>

            <div className="text-center">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 text-gold" />
                Recebemos o seu pedido
              </div>
              <h1 className="text-4xl font-bold tracking-tight text-foreground md:text-5xl">
                Obrigado pelo contacto.
              </h1>
              <p className="mx-auto mt-4 max-w-md text-base text-muted-foreground">
                Estamos a preparar uma proposta desenhada para a sua empresa.
                Entraremos em contacto em breve.
              </p>
            </div>
          </div>

          <ol className="mt-14 divide-y divide-border rounded-xl border border-border bg-card shadow-sm">
            {STEPS.map((step, i) => (
              <li key={step.title} className="flex gap-4 p-5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  {i + 1}
                </span>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">{step.title}</p>
                  <p className="text-sm text-muted-foreground">{step.description}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link to="/">Voltar ao início</Link>
            </Button>
            <Button asChild variant="ghost" size="lg" className="w-full sm:w-auto">
              <a href="https://flowzi.pt" target="_blank" rel="noreferrer">
                Conhecer a Flowzi
              </a>
            </Button>
          </div>
        </main>

        <footer className="pt-10 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} Flowzi · fatura.flowzi.pt
        </footer>
      </div>
    </div>
  );
}
