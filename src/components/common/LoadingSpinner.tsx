import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

interface LoadingSpinnerProps {
  className?: string;
  size?: number;
}

export function LoadingSpinner({ className, size = 24 }: LoadingSpinnerProps) {
  return (
    <div className="flex items-center justify-center">
      <Loader2
        size={size}
        className={cn('animate-spin text-accent', className)}
      />
    </div>
  );
}
