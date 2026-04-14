import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { Home } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center p-8">
      <h1 className="text-6xl font-bold text-primary mb-4">404</h1>
      <h2 className="text-xl font-semibold mb-2">Página não encontrada</h2>
      <p className="text-muted-foreground mb-6 max-w-md">
        A página que procura não existe ou foi movida.
      </p>
      <Button asChild className="gap-2">
        <Link to="/">
          <Home className="h-4 w-4" />
          Voltar ao início
        </Link>
      </Button>
    </div>
  );
}
