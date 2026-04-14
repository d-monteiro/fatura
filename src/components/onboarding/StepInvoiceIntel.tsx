import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CATEGORY_TEMPLATES, DOCUMENT_TYPES, INVOICE_VOLUME_OPTIONS, type OnboardingData } from './onboardingTypes';
import { X, Plus } from 'lucide-react';

interface Props {
  data: OnboardingData;
  onChange: (updates: Partial<OnboardingData>) => void;
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
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAdd())}
          placeholder={placeholder}
        />
        <Button type="button" variant="outline" size="icon" onClick={handleAdd}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {values.map((v, i) => (
            <Badge key={i} variant="secondary" className="gap-1">
              {v}
              <button type="button" onClick={() => onRemove(i)} className="hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </Badge>
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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Inteligência de faturas</h2>
        <p className="text-muted-foreground mt-1">Ajude a IA a compreender melhor os seus documentos.</p>
      </div>

      <div className="space-y-4">
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
            <div className="flex flex-wrap gap-1.5 mb-2">
              {suggestedCategories.map((cat) => (
                <Badge
                  key={cat}
                  variant={data.categories.includes(cat) ? 'default' : 'outline'}
                  className="cursor-pointer"
                  onClick={() => {
                    const cats = data.categories.includes(cat)
                      ? data.categories.filter((c) => c !== cat)
                      : [...data.categories, cat];
                    onChange({ categories: cats });
                  }}
                >
                  {cat}
                </Badge>
              ))}
            </div>
          )}
          <TagInput
            values={data.categories.filter((c) => !suggestedCategories.includes(c))}
            onAdd={(v) => onChange({ categories: [...data.categories, v] })}
            onRemove={(i) => {
              const custom = data.categories.filter((c) => !suggestedCategories.includes(c));
              const removed = custom[i];
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
          <div className="flex gap-3 flex-wrap">
            {DOCUMENT_TYPES.map((dt) => (
              <label key={dt.value} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={data.documentTypes.includes(dt.value)}
                  onChange={(e) => {
                    const types = e.target.checked
                      ? [...data.documentTypes, dt.value]
                      : data.documentTypes.filter((t) => t !== dt.value);
                    onChange({ documentTypes: types });
                  }}
                  className="rounded"
                />
                <span className="text-sm">{dt.label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
