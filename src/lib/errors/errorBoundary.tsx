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
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? <ErrorFallback error={this.state.error} onRetry={() => this.setState({ hasError: false, error: null })} />;
    }
    return this.props.children;
  }
}

function ErrorFallback({ error, onRetry }: { error: Error | null; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center">
      <h2 className="text-xl font-semibold mb-2">Une erreur est survenue</h2>
      <p className="text-sm text-muted-foreground mb-4 max-w-md">
        {error?.message ?? 'Une erreur inattendue s\'est produite. Veuillez réessayer.'}
      </p>
      <button
        onClick={onRetry}
        className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 transition-colors"
      >
        Réessayer
      </button>
    </div>
  );
}
