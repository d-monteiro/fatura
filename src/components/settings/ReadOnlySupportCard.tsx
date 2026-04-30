import { Link } from 'react-router-dom';
import { LifeBuoy, ArrowRight } from 'lucide-react';

export function ReadOnlySupportCard() {
  return (
    <div className="border border-border rounded-xl p-6 space-y-3">
      <div className="flex items-center gap-2">
        <LifeBuoy size={20} />
        <h2 className="text-lg font-semibold">Suporte</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Precisas de ajuda? Abre um pedido e a equipa do FaturaAI responde por email.
      </p>
      <Link
        to="/tickets"
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90"
      >
        Abrir pedido de suporte <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
