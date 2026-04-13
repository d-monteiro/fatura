import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

export function CTA() {
  return (
    <section className="py-20 bg-primary text-primary-foreground">
      <div className="mx-auto max-w-3xl px-4 text-center">
        <h2 className="text-3xl font-bold mb-4">
          Prêt à automatiser vos factures ?
        </h2>
        <p className="text-lg opacity-90 mb-8">
          Commencez en 5 minutes. Configuration guidée, essai gratuit de 14 jours.
        </p>
        <Button
          asChild
          size="lg"
          variant="secondary"
          className="gap-2 text-base"
        >
          <Link to="/onboarding">
            Commencer gratuitement
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </section>
  );
}
