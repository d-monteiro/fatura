export function Footer() {
  return (
    <footer className="border-t py-12">
      <div className="mx-auto max-w-5xl px-4">
        <div className="grid sm:grid-cols-3 gap-8">
          <div>
            <div className="font-bold text-lg text-primary mb-2">FaturaAI</div>
            <p className="text-sm text-muted-foreground">
              Gestão inteligente de faturas de fornecedores com inteligência artificial.
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-sm mb-3">Produto</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><a href="#pricing" className="hover:text-foreground transition-colors">Preços</a></li>
              <li><a href="#features" className="hover:text-foreground transition-colors">Funcionalidades</a></li>
              <li><a href="#faq" className="hover:text-foreground transition-colors">FAQ</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-sm mb-3">Legal</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><span className="cursor-default">Termos de utilização</span></li>
              <li><span className="cursor-default">Política de privacidade</span></li>
              <li><span className="cursor-default">RGPD</span></li>
            </ul>
          </div>
        </div>
        <div className="mt-8 pt-6 border-t text-center text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} FaturaAI. Todos os direitos reservados.
        </div>
      </div>
    </footer>
  );
}
