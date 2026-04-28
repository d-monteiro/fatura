import { Component, type ReactNode, type ErrorInfo } from 'react';
import { reportError } from './errorReporter';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportError(error, {
      level: 'fatal',
      component: info.componentStack?.split('\n')[1]?.trim() ?? 'unknown',
      extra: { componentStack: info.componentStack },
    });

    // Tradutores de browser (Google Translate, etc.) injectam <font> em text
    // nodes e partem o reconciliation do React com NotFoundError. Como já não
    // podemos voltar a um estado consistente, fazemos reload uma vez por
    // sessão — o utilizador vê uma página fresh em vez de uma stack trace.
    if (isDomMutationError(error) && !sessionStorage.getItem('fatura:dom-mutation-recovered')) {
      sessionStorage.setItem('fatura:dom-mutation-recovered', '1');
      window.location.reload();
    }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? <ErrorFallback error={this.state.error} onRetry={() => this.setState({ hasError: false, error: null })} />;
    }
    return this.props.children;
  }
}

function isDomMutationError(error: Error): boolean {
  const msg = error.message ?? '';
  return error.name === 'NotFoundError'
    && (msg.includes('insertBefore') || msg.includes('removeChild'))
    && msg.includes('Node');
}

function ErrorFallback({ error, onRetry }: { error: Error | null; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center">
      <h2 className="text-xl font-semibold mb-2">Ocorreu um erro</h2>
      <p className="text-sm text-muted-foreground mb-4 max-w-md">
        {error?.message ?? 'Ocorreu um erro inesperado. Por favor, tente novamente.'}
      </p>
      <button
        onClick={onRetry}
        className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 transition-colors"
      >
        Tentar novamente
      </button>
    </div>
  );
}
