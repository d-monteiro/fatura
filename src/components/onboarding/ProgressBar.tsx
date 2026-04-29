import { Check } from 'lucide-react';

interface ProgressBarProps {
  currentStep: number;
  totalSteps: number;
  maxReachedStep: number;
  onStepClick: (step: number) => void;
}

const STEP_LABELS = [
  'Empresa',
  'Faturas',
  'Configuração',
  'Resumo',
  'Plano',
];

export function ProgressBar({ currentStep, totalSteps, maxReachedStep, onStepClick }: ProgressBarProps) {
  return (
    <div className="w-full">
      <div className="flex justify-between text-xs text-muted-foreground mb-4">
        <span className="font-medium">Passo {currentStep} / {totalSteps}</span>
        <span className="font-medium text-primary">{STEP_LABELS[currentStep - 1]}</span>
      </div>

      <div className="relative">
        {/* Background line */}
        <div className="absolute top-4 left-0 right-0 h-0.5 bg-muted" />
        {/* Progress line */}
        <div
          className="absolute top-4 left-0 h-0.5 bg-primary transition-all duration-500 ease-out"
          style={{ width: `${((currentStep - 1) / (totalSteps - 1)) * 100}%` }}
        />

        {/* Step dots */}
        <div className="relative flex justify-between">
          {STEP_LABELS.map((label, i) => {
            const step = i + 1;
            const isCompleted = step < currentStep;
            const isCurrent = step === currentStep;
            const isClickable = step <= maxReachedStep;

            return (
              <button
                key={label}
                type="button"
                onClick={() => isClickable && onStepClick(step)}
                disabled={!isClickable}
                className="flex flex-col items-center gap-2 group"
                style={{ width: `${100 / totalSteps}%` }}
              >
                <div
                  className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all ${
                    isCurrent
                      ? 'border-primary bg-primary text-primary-foreground shadow-lg shadow-primary/30 scale-110'
                      : isCompleted
                        ? 'border-primary bg-primary text-primary-foreground cursor-pointer hover:scale-110'
                        : isClickable
                          ? 'border-primary/50 bg-background text-primary cursor-pointer hover:border-primary hover:scale-105'
                          : 'border-muted bg-background text-muted-foreground cursor-not-allowed'
                  }`}
                >
                  {isCompleted ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <span className="text-xs font-bold">{step}</span>
                  )}
                </div>
                <span
                  className={`hidden sm:block text-[10px] text-center leading-tight transition-colors ${
                    isCurrent
                      ? 'text-primary font-semibold'
                      : isCompleted
                        ? 'text-primary/80'
                        : 'text-muted-foreground'
                  }`}
                >
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
