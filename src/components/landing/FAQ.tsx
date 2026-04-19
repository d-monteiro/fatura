import { useState } from 'react';
import { Plus, Minus, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

const faqs = [
  {
    q: 'Como funcionam os 7 dias grátis?',
    a: 'Acesso completo a todas as funcionalidades do plano escolhido. Não pedimos cartão de crédito. Ao fim do 7.º dia, se não subscrever, a conta fica em pausa. Os dados guardam-se até voltar.',
  },
  {
    q: 'Posso cancelar sem pagar nada?',
    a: 'Sim. Durante os 7 dias grátis pode cancelar quando quiser sem sequer introduzir cartão. Se depois subscrever e mudar de ideias, mantém o serviço até ao fim do período pago. Nunca cobramos retroativamente.',
  },
  {
    q: 'Que tipos de documentos a IA processa?',
    a: 'PDF, JPG, PNG e HEIC (iPhone). Faturas, recibos, notas de crédito e orçamentos. A IA adapta-se a layouts de fornecedores portugueses e estrangeiros.',
  },
  {
    q: 'Como é a sincronização com o Gmail?',
    a: 'Liga a sua conta Google em 2 cliques. Todas as noites, à meia-noite, o FaturaAI lê os anexos de fatura novos e processa-os, sem ler o resto dos seus emails.',
  },
  {
    q: 'Posso gerir várias empresas?',
    a: 'Sim. O plano Pro permite até 3 empresas, o Empresarial é ilimitado. Cada uma tem fornecedores, categorias e Drive próprios. Ideal para holdings e contabilistas.',
  },
  {
    q: 'Os meus dados estão seguros?',
    a: 'Sim. Os seus dados ficam separados dos de qualquer outra empresa e guardados em servidores na Europa, ao abrigo do RGPD. Os PDFs originais vão também para o seu próprio Google Drive, por isso tem sempre controlo total sobre eles.',
  },
  {
    q: 'Qual é a precisão da extração?',
    a: 'Mais de 95% em faturas PT padrão. Campos duvidosos são sinalizados para validação em 1 clique. A IA aprende com as correções que fizer.',
  },
  {
    q: 'Posso exportar para o meu contabilista?',
    a: 'Sim. Export Excel (.xlsx) organizado por mês e categoria a qualquer momento. Os PDFs originais estão sempre no seu Drive em pastas estruturadas.',
  },
];

export function FAQ() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className="py-24 md:py-32">
      <div className="mx-auto max-w-3xl px-6">
        <div className="max-w-2xl">
          <div className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1 text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
            Dúvidas
          </div>
          <h2 className="mt-6 text-4xl font-bold leading-[1.05] tracking-tighter text-primary md:text-5xl">
            As perguntas que chegam sempre antes de começar.
          </h2>
        </div>

        <div className="mt-14 border-t border-border">
          {faqs.map((faq, i) => {
            const isOpen = open === i;
            return (
              <div key={i} className="border-b border-border">
                <button
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="flex w-full items-start justify-between gap-6 py-5 text-left transition-colors"
                >
                  <span className="text-base font-medium leading-snug text-primary">
                    {faq.q}
                  </span>
                  <span className={`mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${isOpen ? 'rotate-180 bg-primary text-primary-foreground' : ''}`}>
                    {isOpen ? <Minus className="h-3 w-3" strokeWidth={2} /> : <Plus className="h-3 w-3" strokeWidth={2} />}
                  </span>
                </button>
                <div
                  className={`grid transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                    isOpen ? 'grid-rows-[1fr] pb-6 opacity-100' : 'grid-rows-[0fr] opacity-0'
                  }`}
                >
                  <div className="overflow-hidden">
                    <p className="pr-10 text-sm leading-relaxed text-muted-foreground">
                      {faq.a}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-14 rounded-2xl border border-border bg-card p-8 text-center">
          <p className="text-lg text-primary">Mais fácil é começar e ver.</p>
          <p className="mt-1 text-sm text-muted-foreground">7 dias sem cartão. Sem risco.</p>
          <Button
            asChild
            className="group mt-6 h-12 rounded-full bg-primary pl-6 pr-2 text-base font-medium text-primary-foreground"
          >
            <Link to="/onboarding" className="inline-flex items-center gap-3">
              Começar os meus 7 dias grátis
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-accent-foreground transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-0.5">
                <ArrowRight className="!h-4 !w-4" />
              </span>
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
