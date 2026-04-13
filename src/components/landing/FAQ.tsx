import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

const faqs = [
  {
    q: 'Comment fonctionne l\'essai gratuit ?',
    a: 'Vous bénéficiez de 14 jours d\'accès complet à toutes les fonctionnalités de votre plan. Aucune carte bancaire n\'est requise pour commencer.',
  },
  {
    q: 'Quels types de documents sont supportés ?',
    a: 'Factures, reçus, avoirs et devis au format PDF, JPG ou PNG. Notre IA s\'adapte à tous les formats et mises en page.',
  },
  {
    q: 'Mes données sont-elles sécurisées ?',
    a: 'Oui. Chaque client dispose d\'un espace isolé avec chiffrement des données. Nous sommes conformes au RGPD et vos données restent en Europe.',
  },
  {
    q: 'Puis-je gérer plusieurs entreprises ?',
    a: 'Oui. Le plan Pro permet jusqu\'à 3 entreprises, et le plan Entreprise offre un nombre illimité de sociétés.',
  },
  {
    q: 'Comment fonctionne l\'import par email ?',
    a: 'Connectez votre compte Gmail et FaturaAI détecte automatiquement les factures en pièce jointe. Elles sont analysées et classées sans intervention.',
  },
  {
    q: 'Puis-je exporter mes données ?',
    a: 'Oui. Export Excel/CSV disponible à tout moment. Vos fichiers restent aussi sur votre Google Drive personnel.',
  },
  {
    q: 'Quelle est la précision de l\'IA ?',
    a: 'Notre IA atteint plus de 95% de précision sur l\'extraction de données. Les cas douteux sont signalés pour vérification manuelle.',
  },
  {
    q: 'Puis-je annuler à tout moment ?',
    a: 'Oui, sans engagement. Vous pouvez annuler votre abonnement à tout moment depuis votre espace de facturation.',
  },
];

export function FAQ() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section className="py-20">
      <div className="mx-auto max-w-3xl px-4">
        <h2 className="text-3xl font-bold text-center mb-4">Questions fréquentes</h2>
        <p className="text-center text-muted-foreground mb-12">
          Tout ce que vous devez savoir pour commencer.
        </p>

        <div className="space-y-2">
          {faqs.map((faq, i) => (
            <div key={i} className="rounded-lg border">
              <button
                className="w-full flex items-center justify-between p-4 text-left"
                onClick={() => setOpen(open === i ? null : i)}
              >
                <span className="font-medium text-sm">{faq.q}</span>
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${
                  open === i ? 'rotate-180' : ''
                }`} />
              </button>
              {open === i && (
                <div className="px-4 pb-4 text-sm text-muted-foreground">
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
