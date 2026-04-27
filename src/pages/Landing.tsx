import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Hero } from '@/components/landing/Hero';
import { Problem } from '@/components/landing/Problem';
import { HowItWorks } from '@/components/landing/HowItWorks';
import { Features } from '@/components/landing/Features';
import { Pricing } from '@/components/landing/Pricing';
import { FAQ } from '@/components/landing/FAQ';
import { CTA } from '@/components/landing/CTA';
import { Footer } from '@/components/landing/Footer';

export default function Landing() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="min-h-screen bg-background" translate="yes">
      <header
        className={`sticky top-0 z-50 transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          scrolled
            ? 'border-b border-border bg-background/80 backdrop-blur-xl'
            : 'border-b border-transparent'
        }`}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <div className="flex flex-col">
            <Link to="/" className="text-lg font-bold leading-none tracking-tighter text-primary">
              FaturaAI
            </Link>
            <a
              href="https://flowzi.pt"
              target="_blank"
              rel="noreferrer"
              className="mt-0.5 inline-flex w-max items-center gap-1 text-[10px] font-medium text-muted-foreground transition-colors hover:text-primary"
            >
              <span>by</span>
              <img src="/favicon.png" alt="" className="h-2.5 w-2.5 object-contain" aria-hidden="true" />
              <span className="tracking-tight">Flowzi</span>
            </a>
          </div>

          <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
            <a href="#como-funciona" className="transition-colors hover:text-primary">Como funciona</a>
            <a href="#funcionalidades" className="transition-colors hover:text-primary">Funcionalidades</a>
            <a href="#pricing" className="transition-colors hover:text-primary">Preços</a>
            <a href="#faq" className="transition-colors hover:text-primary">FAQ</a>
          </nav>

          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link to="/login">Entrar</Link>
            </Button>
            <Button
              asChild
              className="group h-10 rounded-full bg-primary pl-4 pr-1 text-sm text-primary-foreground"
            >
              <Link to="/onboarding" className="inline-flex items-center gap-2">
                <span className="hidden sm:inline">Começar grátis</span>
                <span className="sm:hidden">Começar</span>
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-accent-foreground transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-0.5">
                  <ArrowRight className="!h-3.5 !w-3.5" />
                </span>
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main>
        <Hero />
        <Problem />
        <HowItWorks />
        <Features />
        <Pricing />
        <FAQ />
        <CTA />
      </main>

      <Footer />
    </div>
  );
}
