import type { ReactNode } from 'react';
import { Lock, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useFeatureGate } from '@/hooks/useFeatureGate';
import type { FeatureKey } from '@/lib/billing/featureMap';

interface FeatureGateProps {
  feature: FeatureKey;
  children: ReactNode;
  fallback?: ReactNode;
  /** Quando true, devolve sempre os children e o caller decide como mostrar bloqueio. */
  renderWhenLocked?: boolean;
}

export function FeatureGate({ feature, children, fallback, renderWhenLocked }: FeatureGateProps) {
  const gate = useFeatureGate(feature);

  if (gate.allowed) return <>{children}</>;
  if (renderWhenLocked) return <>{children}</>;
  if (fallback !== undefined) return <>{fallback}</>;

  return <FeatureLockedNotice message={gate.message ?? 'Funcionalidade bloqueada.'} />;
}

interface FeatureLockedNoticeProps {
  message: string;
  className?: string;
}

export function FeatureLockedNotice({ message, className }: FeatureLockedNoticeProps) {
  return (
    <div
      className={
        'flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 ' +
        (className ?? '')
      }
    >
      <Lock className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="space-y-1">
        <p className="font-medium flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5" />
          {message}
        </p>
        <p className="text-xs text-amber-800/80">
          Faz upgrade em{' '}
          <Link to="/billing" className="underline font-medium">
            Faturação
          </Link>{' '}
          para activar.
        </p>
      </div>
    </div>
  );
}
