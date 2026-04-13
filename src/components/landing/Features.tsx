import { Brain, FolderOpen, Mail, BarChart3, Shield, Globe } from 'lucide-react';

const features = [
  {
    icon: Brain,
    title: 'IA de pointe',
    description: 'Gemini 2.5 Pro analyse et catégorise vos factures avec une précision supérieure à 95%.',
  },
  {
    icon: FolderOpen,
    title: 'Google Drive automatique',
    description: 'Chaque facture est classée dans votre Drive selon votre structure de dossiers personnalisée.',
  },
  {
    icon: Mail,
    title: 'Sync email',
    description: 'Vos factures reçues par email sont automatiquement détectées et traitées.',
  },
  {
    icon: BarChart3,
    title: 'Dashboard & rapports',
    description: 'Suivez vos dépenses en temps réel avec des graphiques et des rapports automatiques.',
  },
  {
    icon: Shield,
    title: 'Sécurité entreprise',
    description: 'Isolation des données par tenant, chiffrement, conformité RGPD. Vos données restent les vôtres.',
  },
  {
    icon: Globe,
    title: 'Multi-entreprise',
    description: 'Gérez plusieurs sociétés depuis un seul espace. Idéal pour les holdings et groupes.',
  },
];

export function Features() {
  return (
    <section className="py-20">
      <div className="mx-auto max-w-5xl px-4">
        <h2 className="text-3xl font-bold text-center mb-4">
          Tout ce dont vous avez besoin
        </h2>
        <p className="text-center text-muted-foreground mb-12 max-w-xl mx-auto">
          Une solution complète pour la gestion de vos factures fournisseurs.
        </p>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f, i) => (
            <div key={i} className="rounded-xl border p-6 hover:shadow-md transition-shadow">
              <div className="inline-flex items-center justify-center h-10 w-10 rounded-lg bg-primary/10 text-primary mb-4">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="font-semibold mb-2">{f.title}</h3>
              <p className="text-sm text-muted-foreground">{f.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
