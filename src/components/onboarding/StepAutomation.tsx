import { type OnboardingData } from './onboardingTypes';
import { Mail } from 'lucide-react';

interface Props {
  data: OnboardingData;
  onChange: (updates: Partial<OnboardingData>) => void;
}

export function StepAutomation({ data, onChange }: Props) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Automação por email</h2>
        <p className="text-muted-foreground mt-1">
          Liga o teu Gmail e as faturas recebidas são processadas automaticamente.
        </p>
      </div>

      <label className="flex items-center justify-between p-4 rounded-lg border cursor-pointer hover:bg-muted/50">
        <div className="flex items-center gap-3">
          <Mail className="h-5 w-5 text-primary" />
          <div>
            <div className="font-medium text-sm">Sincronização automática de Gmail</div>
            <div className="text-xs text-muted-foreground">
              Todos os dias às 23:58 verificamos os emails das últimas 24h
              com anexos PDF/imagem, e processamos com IA.
            </div>
          </div>
        </div>
        <input
          type="checkbox"
          checked={data.emailSync}
          onChange={(e) => onChange({ emailSync: e.target.checked })}
          className="rounded h-5 w-5"
        />
      </label>

      <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-primary">
        A ligação à tua conta Google acontece depois de criares o acesso (passo final).
        Podes adicionar vários emails — um por empresa — em Definições.
      </div>
    </div>
  );
}
