import { ClipboardList, Settings, Zap } from 'lucide-react';

const steps = [
  {
    icon: ClipboardList,
    title: 'Responda',
    description: 'Preencha um questionário rápido sobre a sua empresa, categorias e fornecedores.',
  },
  {
    icon: Settings,
    title: 'Configuramos',
    description: 'A nossa IA configura automaticamente o seu espaço: categorias, pastas Drive, prompts personalizados.',
  },
  {
    icon: Zap,
    title: 'Automatize',
    description: 'Faça upload ou envie faturas por email. A IA faz o resto: análise, classificação, relatórios.',
  },
];

export function HowItWorks() {
  return (
    <section className="py-20 bg-muted/30">
      <div className="mx-auto max-w-5xl px-4">
        <h2 className="text-3xl font-bold text-center mb-4">Como funciona</h2>
        <p className="text-center text-muted-foreground mb-12 max-w-xl mx-auto">
          Três passos simples para automatizar a gestão de faturas.
        </p>

        <div className="grid md:grid-cols-3 gap-8">
          {steps.map((step, i) => (
            <div key={i} className="text-center">
              <div className="inline-flex items-center justify-center h-14 w-14 rounded-full bg-primary/10 text-primary mb-4">
                <step.icon className="h-7 w-7" />
              </div>
              <div className="text-xs font-medium text-primary mb-2">Passo {i + 1}</div>
              <h3 className="text-xl font-semibold mb-2">{step.title}</h3>
              <p className="text-sm text-muted-foreground">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
