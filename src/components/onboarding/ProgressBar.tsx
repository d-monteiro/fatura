interface ProgressBarProps {
  currentStep: number;
  totalSteps: number;
}

const STEP_LABELS = [
  'Empresa',
  'Faturas',
  'Armazenamento',
  'Dashboard',
  'Automação',
  'Resumo',
  'Plano',
];

export function ProgressBar({ currentStep, totalSteps }: ProgressBarProps) {
  const progress = ((currentStep - 1) / (totalSteps - 1)) * 100;

  return (
    <div className="w-full space-y-3">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Passo {currentStep} / {totalSteps}</span>
        <span>{STEP_LABELS[currentStep - 1]}</span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="hidden sm:flex justify-between">
        {STEP_LABELS.map((label, i) => (
          <span
            key={label}
            className={`text-[10px] transition-colors ${
              i + 1 <= currentStep
                ? 'text-primary font-medium'
                : 'text-muted-foreground'
            }`}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
