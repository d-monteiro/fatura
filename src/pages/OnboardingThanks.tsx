import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';

export default function OnboardingThanks() {
  return (
    <div className="flex min-h-screen items-center justify-center p-8">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <CheckCircle2 className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-3xl font-bold mb-3">Obrigado pelo seu interesse!</h1>
        <p className="text-muted-foreground mb-8">
          Recebemos a sua submissão para o plano Empresarial.
          A nossa equipa vai entrar em contacto nas próximas 24 horas úteis
          para agendar uma reunião de configuração personalizada.
        </p>
        <Button asChild>
          <Link to="/">Voltar ao início</Link>
        </Button>
      </div>
    </div>
  );
}
