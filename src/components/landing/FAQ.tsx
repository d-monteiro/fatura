import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

const faqs = [
  {
    q: 'Como funciona o teste grátis?',
    a: 'Tem 7 dias de acesso completo a todas as funcionalidades do seu plano. Não é necessário cartão de crédito para começar.',
  },
  {
    q: 'Que tipos de documentos são suportados?',
    a: 'Faturas, recibos, notas de crédito e orçamentos em formato PDF, JPG ou PNG. A nossa IA adapta-se a todos os formatos e layouts.',
  },
  {
    q: 'Os meus dados estão seguros?',
    a: 'Sim. Cada cliente tem um espaço isolado com encriptação de dados. Somos conformes ao RGPD e os seus dados ficam na Europa.',
  },
  {
    q: 'Posso gerir várias empresas?',
    a: 'Sim. O plano Pro permite até 3 empresas, e o plano Empresarial oferece um número ilimitado de empresas.',
  },
  {
    q: 'Como funciona a importação por email?',
    a: 'Conecte a sua conta Gmail e o FaturaAI deteta automaticamente as faturas em anexo. São analisadas e classificadas sem intervenção.',
  },
  {
    q: 'Posso exportar os meus dados?',
    a: 'Sim. Exportação Excel/CSV disponível a qualquer momento. Os seus ficheiros ficam também no seu Google Drive pessoal.',
  },
  {
    q: 'Qual é a precisão da IA?',
    a: 'A nossa IA atinge mais de 95% de precisão na extração de dados. Os casos duvidosos são sinalizados para verificação manual.',
  },
  {
    q: 'Posso cancelar a qualquer momento?',
    a: 'Sim, sem compromisso. Pode cancelar a sua subscrição a qualquer momento a partir do seu espaço de faturação.',
  },
];

export function FAQ() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section className="py-20">
      <div className="mx-auto max-w-3xl px-4">
        <h2 className="text-3xl font-bold text-center mb-4">Perguntas frequentes</h2>
        <p className="text-center text-muted-foreground mb-12">
          Tudo o que precisa de saber para começar.
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
