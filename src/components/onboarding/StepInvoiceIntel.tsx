import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { DOCUMENT_TYPES, INVOICE_VOLUME_OPTIONS, type OnboardingData } from './onboardingTypes';
import { X, Plus } from 'lucide-react';

interface Props {
  data: OnboardingData;
  onChange: (updates: Partial<OnboardingData>) => void;
}

function Chip({ label, selected, onClick, onRemove }: {
  label: string;
  selected?: boolean;
  onClick?: () => void;
  onRemove?: () => void;
}) {
  return (
    <span
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${
        selected
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-background border-border hover:border-primary/50'
      } ${onClick ? 'cursor-pointer' : ''}`}
    >
      {label}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="hover:opacity-70"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}

function TagInput({ values, onAdd, onRemove, placeholder }: {
  values: string[];
  onAdd: (v: string) => void;
  onRemove: (i: number) => void;
  placeholder: string;
}) {
  const [input, setInput] = useState('');
  const handleAdd = () => {
    const trimmed = input.trim();
    if (trimmed && !values.includes(trimmed)) {
      onAdd(trimmed);
      setInput('');
    }
  };
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleAdd();
            }
          }}
          placeholder={placeholder}
        />
        <Button type="button" variant="outline" size="icon" onClick={handleAdd}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {values.map((v, i) => (
            <Chip key={i} label={v} selected onRemove={() => onRemove(i)} />
          ))}
        </div>
      )}
    </div>
  );
}

export function StepInvoiceIntel({ data, onChange }: Props) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">As suas faturas</h2>
        <p className="text-muted-foreground mt-1">
          Só o essencial. Pode editar tudo em Definições mais tarde.
        </p>
      </div>

      <div className="space-y-5">
        <div className="space-y-2">
          <Label>Nome da sua empresa como aparece nas faturas</Label>
          <TagInput
            values={data.invoiceNameVariations}
            onAdd={(v) => onChange({ invoiceNameVariations: [...data.invoiceNameVariations, v] })}
            onRemove={(i) => onChange({ invoiceNameVariations: data.invoiceNameVariations.filter((_, idx) => idx !== i) })}
            placeholder="Ex: EMPRESA EXEMPLO LDA"
          />
        </div>

        <div className="space-y-2">
          <Label>Número médio de faturas esperadas por mês</Label>
          <p className="text-xs text-muted-foreground">É só uma estimativa.</p>
          <div className="flex gap-2 flex-wrap pt-1">
            {INVOICE_VOLUME_OPTIONS.map((v) => (
              <Button
                key={v}
                type="button"
                variant={data.invoicesPerMonth === v ? 'default' : 'outline'}
                size="sm"
                onClick={() => onChange({ invoicesPerMonth: v })}
              >
                {v === 1000 ? '1000+' : v}
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Tipos de documentos</Label>
          <div className="flex flex-wrap gap-1.5">
            {DOCUMENT_TYPES.map((dt) => (
              <Chip
                key={dt.value}
                label={dt.label}
                selected={data.documentTypes.includes(dt.value)}
                onClick={() => {
                  const next = data.documentTypes.includes(dt.value)
                    ? data.documentTypes.filter((t) => t !== dt.value)
                    : [...data.documentTypes, dt.value];
                  onChange({ documentTypes: next });
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
