import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { CATEGORY_TEMPLATES, DOCUMENT_TYPES, INVOICE_VOLUME_OPTIONS, type OnboardingData } from './onboardingTypes';
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
  const template = data.sector ? CATEGORY_TEMPLATES[data.sector] : null;
  const suggestedCategories = template
    ? [...template.metiers, ...template.natures, ...template.cost_types]
    : [];
  const customCategories = data.categories.filter((c) => !suggestedCategories.includes(c));

  const toggleCategory = (cat: string) => {
    const next = data.categories.includes(cat)
      ? data.categories.filter((c) => c !== cat)
      : [...data.categories, cat];
    onChange({ categories: next });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Inteligência de faturas</h2>
        <p className="text-muted-foreground mt-1">Ajude a IA a compreender melhor os seus documentos.</p>
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
          <Label>Número médio de faturas por mês</Label>
          <div className="flex gap-2 flex-wrap">
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
          <Label>Categorias de custos</Label>
          {suggestedCategories.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {suggestedCategories.map((cat) => (
                <Chip
                  key={cat}
                  label={cat}
                  selected={data.categories.includes(cat)}
                  onClick={() => toggleCategory(cat)}
                />
              ))}
            </div>
          )}
          <TagInput
            values={customCategories}
            onAdd={(v) => onChange({ categories: [...data.categories, v] })}
            onRemove={(i) => {
              const removed = customCategories[i];
              onChange({ categories: data.categories.filter((c) => c !== removed) });
            }}
            placeholder="Adicionar categoria personalizada"
          />
        </div>

        <div className="space-y-2">
          <Label>Top fornecedores (5 a 10)</Label>
          <TagInput
            values={data.topSuppliers}
            onAdd={(v) => onChange({ topSuppliers: [...data.topSuppliers, v] })}
            onRemove={(i) => onChange({ topSuppliers: data.topSuppliers.filter((_, idx) => idx !== i) })}
            placeholder="Nome do fornecedor"
          />
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
