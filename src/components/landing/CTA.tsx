import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

export function CTA() {
  return (
    <section className="py-20 bg-primary text-primary-foreground">
      <div className="mx-auto max-w-3xl px-4 text-center">
        <h2 className="text-3xl sm:text-4xl font-bold mb-4">
          Pronto para começar?
        </h2>
        <p className="text-lg opacity-90 mb-8 max-w-xl mx-auto">
          Configuração em 5 minutos. Cancele a qualquer momento.
        </p>
        <Button
          asChild
          size="lg"
          variant="secondary"
          className="h-14 px-8 text-base"
        >
          <Link to="/onboarding" className="inline-flex items-center whitespace-nowrap gap-2">
            Começar grátis · 7 dias
            <ArrowRight className="h-5 w-5" />
          </Link>
        </Button>
      </div>
    </section>
  );
}
