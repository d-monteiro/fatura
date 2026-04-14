import { Hero } from '@/components/landing/Hero';
import { HowItWorks } from '@/components/landing/HowItWorks';
import { Features } from '@/components/landing/Features';
import { Pricing } from '@/components/landing/Pricing';
import { FAQ } from '@/components/landing/FAQ';
import { CTA } from '@/components/landing/CTA';
import { Footer } from '@/components/landing/Footer';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-5xl px-4 flex items-center justify-between h-14">
          <span className="font-bold text-lg text-primary">FaturaAI</span>
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="sm">
              <a href="#pricing">Preços</a>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link to="/login">Entrar</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/onboarding">Começar</Link>
            </Button>
          </div>
        </div>
      </header>

      <Hero />
      <HowItWorks />
      <Features />
      <Pricing />
      <FAQ />
      <CTA />
      <Footer />
    </div>
  );
}
