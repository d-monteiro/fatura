import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { ArrowRight, Sparkles } from 'lucide-react';

export function Hero() {
  return (
    <section className="relative overflow-hidden py-20 sm:py-32">
      <div className="mx-auto max-w-5xl px-4 text-center">
        <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-sm text-primary mb-6">
          <Sparkles className="h-4 w-4" />
          Propulsé par l'intelligence artificielle
        </div>

        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-foreground">
          Gérez vos factures{' '}
          <span className="text-primary">automatiquement</span>
          <br />
          avec l'IA
        </h1>

        <p className="mt-6 text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto">
          FaturaAI analyse, catégorise et organise vos factures fournisseurs.
          Google Drive, Sheets, rapports — tout est automatisé. Setup en 5 minutes.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
          <Button asChild size="lg" className="gap-2 text-base">
            <Link to="/onboarding">
              Commencer gratuitement
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="text-base">
            <a href="#pricing">Voir les tarifs</a>
          </Button>
        </div>

        <p className="mt-4 text-sm text-muted-foreground">
          14 jours d'essai gratuit — Aucune carte bancaire requise
        </p>
      </div>
    </section>
  );
}
