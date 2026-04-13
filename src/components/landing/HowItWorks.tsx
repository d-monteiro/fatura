import { ClipboardList, Settings, Zap } from 'lucide-react';

const steps = [
  {
    icon: ClipboardList,
    title: 'Répondez',
    description: 'Remplissez un questionnaire rapide sur votre entreprise, vos catégories et vos fournisseurs.',
  },
  {
    icon: Settings,
    title: 'On configure',
    description: 'Notre IA calibre automatiquement votre espace : catégories, dossiers Drive, prompts personnalisés.',
  },
  {
    icon: Zap,
    title: 'Automatisez',
    description: 'Uploadez ou envoyez vos factures par email. L\'IA fait le reste : analyse, classement, rapports.',
  },
];

export function HowItWorks() {
  return (
    <section className="py-20 bg-muted/30">
      <div className="mx-auto max-w-5xl px-4">
        <h2 className="text-3xl font-bold text-center mb-4">Comment ça marche</h2>
        <p className="text-center text-muted-foreground mb-12 max-w-xl mx-auto">
          Trois étapes simples pour automatiser votre gestion de factures.
        </p>

        <div className="grid md:grid-cols-3 gap-8">
          {steps.map((step, i) => (
            <div key={i} className="text-center">
              <div className="inline-flex items-center justify-center h-14 w-14 rounded-full bg-primary/10 text-primary mb-4">
                <step.icon className="h-7 w-7" />
              </div>
              <div className="text-xs font-medium text-primary mb-2">Étape {i + 1}</div>
              <h3 className="text-xl font-semibold mb-2">{step.title}</h3>
              <p className="text-sm text-muted-foreground">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
