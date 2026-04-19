import { Link } from 'react-router-dom';

type LinkItem = { label: string; href?: string; to?: string };

export function Footer() {
  return (
    <footer className="border-t border-border bg-background py-16">
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid gap-10 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div>
            <div className="text-lg font-bold tracking-tighter text-primary">FaturaAI</div>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
              Gestão de faturas de fornecedores com IA, para PMEs e contabilistas em Portugal.
            </p>
            <div className="mt-8">
              <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-muted-foreground">
                Um produto
              </p>
              <a
                href="https://flowzi.pt"
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-2 transition-opacity duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:opacity-60"
              >
                <img
                  src="/favicon.png"
                  alt=""
                  className="h-5 w-5 object-contain"
                  aria-hidden="true"
                />
                <span className="text-lg font-bold tracking-tighter text-primary">Flowzi</span>
              </a>
            </div>
          </div>
          <FooterCol title="Produto" links={[
            { label: 'Funcionalidades', href: '#funcionalidades' },
            { label: 'Preços', href: '#pricing' },
            { label: 'FAQ', href: '#faq' },
            { label: 'Entrar', to: '/login' },
          ]} />
          <FooterCol title="Empresa" links={[
            { label: 'Suporte', href: 'mailto:diogo.coutinho@flowzi.pt' },
          ]} />
          <FooterCol title="Legal" links={[
            { label: 'Termos', to: '/legal/terms' },
            { label: 'Privacidade', to: '/legal/privacy' },
            { label: 'RGPD', href: 'mailto:diogo.coutinho@flowzi.pt' },
          ]} />
        </div>
        <div className="mt-14 flex flex-col items-start justify-between gap-4 border-t border-border pt-6 md:flex-row md:items-center">
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} FaturaAI. Todos os direitos reservados.
          </p>
          <p className="text-xs text-muted-foreground">Feito em Portugal.</p>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: LinkItem[] }) {
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">{title}</h4>
      <ul className="mt-4 space-y-2.5">
        {links.map((l) => (
          <li key={l.label}>
            {l.to ? (
              <Link to={l.to} className="text-sm text-primary transition-colors hover:text-accent">
                {l.label}
              </Link>
            ) : (
              <a href={l.href} className="text-sm text-primary transition-colors hover:text-accent">
                {l.label}
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
