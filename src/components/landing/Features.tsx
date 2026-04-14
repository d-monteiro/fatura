import { Brain, FolderOpen, Mail, BarChart3, Shield, Globe } from 'lucide-react';

const features = [
  {
    icon: Brain,
    title: 'IA de ponta',
    description: 'Gemini 2.5 Pro analisa e categoriza as suas faturas com precisão superior a 95%.',
  },
  {
    icon: FolderOpen,
    title: 'Google Drive automático',
    description: 'Cada fatura é classificada no seu Drive segundo a sua estrutura de pastas personalizada.',
  },
  {
    icon: Mail,
    title: 'Sincronização de email',
    description: 'As faturas recebidas por email são automaticamente detetadas e processadas.',
  },
  {
    icon: BarChart3,
    title: 'Dashboard e relatórios',
    description: 'Acompanhe as suas despesas em tempo real com gráficos e relatórios automáticos.',
  },
  {
    icon: Shield,
    title: 'Segurança empresarial',
    description: 'Isolamento de dados por tenant, encriptação, conformidade RGPD. Os seus dados são seus.',
  },
  {
    icon: Globe,
    title: 'Multi-empresa',
    description: 'Gira várias empresas a partir de um único espaço. Ideal para holdings e grupos.',
  },
];

export function Features() {
  return (
    <section className="py-20">
      <div className="mx-auto max-w-5xl px-4">
        <h2 className="text-3xl font-bold text-center mb-4">
          Tudo o que precisa
        </h2>
        <p className="text-center text-muted-foreground mb-12 max-w-xl mx-auto">
          Uma solução completa para a gestão das suas faturas de fornecedores.
        </p>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f, i) => (
            <div key={i} className="rounded-xl border p-6 hover:shadow-md transition-shadow">
              <div className="inline-flex items-center justify-center h-10 w-10 rounded-lg bg-primary/10 text-primary mb-4">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="font-semibold mb-2">{f.title}</h3>
              <p className="text-sm text-muted-foreground">{f.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
