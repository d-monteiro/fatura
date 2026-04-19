import { Link } from 'react-router-dom';

interface Props {
  acceptedTerms: boolean;
  acceptedPrivacy: boolean;
  onTermsChange: (v: boolean) => void;
  onPrivacyChange: (v: boolean) => void;
  disabled?: boolean;
  error?: boolean;
  errorNonce?: number;
}

export function LegalConsentCheckboxes({
  acceptedTerms,
  acceptedPrivacy,
  onTermsChange,
  onPrivacyChange,
  disabled,
  error,
  errorNonce = 0,
}: Props) {
  const wrapperCls = error
    ? 'border-destructive bg-destructive/5 animate-shake'
    : 'border-primary/15 bg-background/60';
  return (
    <div
      key={errorNonce}
      className={`space-y-2 rounded-lg border px-4 py-3 transition-colors ${wrapperCls}`}
    >
      <label className="flex items-start gap-2.5 text-xs text-muted-foreground cursor-pointer select-none">
        <input
          type="checkbox"
          checked={acceptedTerms}
          onChange={(e) => onTermsChange(e.target.checked)}
          disabled={disabled}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-primary/40 accent-primary cursor-pointer disabled:cursor-not-allowed"
        />
        <span>
          Li e aceito os{' '}
          <Link
            to="/legal/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-foreground underline underline-offset-2 hover:text-primary"
          >
            Termos e Condições
          </Link>
          .
        </span>
      </label>
      <label className="flex items-start gap-2.5 text-xs text-muted-foreground cursor-pointer select-none">
        <input
          type="checkbox"
          checked={acceptedPrivacy}
          onChange={(e) => onPrivacyChange(e.target.checked)}
          disabled={disabled}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-primary/40 accent-primary cursor-pointer disabled:cursor-not-allowed"
        />
        <span>
          Li e aceito a{' '}
          <Link
            to="/legal/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-foreground underline underline-offset-2 hover:text-primary"
          >
            Política de Privacidade
          </Link>
          .
        </span>
      </label>
      {error && (
        <p className="pt-1 text-xs font-medium text-destructive">
          Aceite os Termos e a Política de Privacidade para continuar.
        </p>
      )}
    </div>
  );
}
