import type { TranslationKey } from '@/lib/i18n';
import { useTenant } from '@/contexts/TenantContext';
import { useCategories } from '@/hooks/useCategories';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { isValidNifPT, normalizeNifPT } from '@/lib/utils/nif';

type TFn = (key: TranslationKey) => string;

interface FormData {
  supplier_name: string; supplier_nif: string; doc_number: string; doc_date: string;
  valor_sem_iva: string; valor_iva: string; valor_total: string; taxa_iva: string;
  category: string; summary: string;
  is_fixed: '' | 'fixed' | 'variable';
}

interface Props {
  form: FormData;
  onChange: (key: string, value: string) => void;
  t: TFn;
}

export type { FormData as InvoiceEditFormData };

export function InvoiceEditFormFields({ form, onChange, t }: Props) {
  const set = onChange;
  const { tenant } = useTenant();
  const { categories, isFixed: isCategoryFixed } = useCategories(tenant?.id);
  const inheritedFixed = isCategoryFixed(form.category || null);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
      <div className="space-y-1.5">
        <Label htmlFor="ie-supplier">{t('inv.supplier')}</Label>
        <Input
          id="ie-supplier"
          value={form.supplier_name}
          onChange={(e) => set('supplier_name', e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ie-nif">{t('inv.nif')}</Label>
        <Input
          id="ie-nif"
          className={`font-mono ${
            form.supplier_nif && !isValidNifPT(form.supplier_nif)
              ? 'border-amber-400 focus-visible:ring-amber-300'
              : ''
          }`}
          value={form.supplier_nif}
          onChange={(e) => set('supplier_nif', e.target.value)}
          placeholder="123 456 789"
        />
        {form.supplier_nif && !isValidNifPT(form.supplier_nif) && (
          <p className="text-xs text-amber-700">
            NIF {normalizeNifPT(form.supplier_nif) ? 'inválido — verifica o último dígito' : 'tem que ter 9 dígitos'}.
          </p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ie-doc-number">{t('inv.doc_number')}</Label>
        <Input
          id="ie-doc-number"
          value={form.doc_number}
          onChange={(e) => set('doc_number', e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ie-date">{t('inv.date')}</Label>
        <Input
          id="ie-date"
          type="date"
          value={form.doc_date}
          onChange={(e) => set('doc_date', e.target.value)}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="ie-net">{t('inv.amount_net')}</Label>
          <Input
            id="ie-net"
            type="number"
            step="0.01"
            value={form.valor_sem_iva}
            onChange={(e) => set('valor_sem_iva', e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ie-iva">{t('inv.iva')}</Label>
          <Input
            id="ie-iva"
            type="number"
            step="0.01"
            value={form.valor_iva}
            onChange={(e) => set('valor_iva', e.target.value)}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="ie-total">{t('inv.amount_total')}</Label>
          <Input
            id="ie-total"
            type="number"
            step="0.01"
            value={form.valor_total}
            onChange={(e) => set('valor_total', e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ie-iva-rate">{t('inv.iva_rate')} (%)</Label>
          <Input
            id="ie-iva-rate"
            type="number"
            step="0.1"
            value={form.taxa_iva}
            onChange={(e) => set('taxa_iva', e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>{t('inv.category')}</Label>
        <Select value={form.category} onValueChange={(v) => set('category', v)}>
          <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
          <SelectContent>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.code}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Tipo de custo</Label>
        <div className="flex gap-1">
          {([
            ['', `Default (${inheritedFixed ? 'fixo' : 'variável'})`],
            ['fixed', 'Fixo'],
            ['variable', 'Variável'],
          ] as const).map(([val, label]) => (
            <button
              key={val || 'default'}
              type="button"
              onClick={() => set('is_fixed', val)}
              className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition ${
                form.is_fixed === val
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-input bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ie-summary">{t('inv.summary')}</Label>
        <Input
          id="ie-summary"
          value={form.summary}
          onChange={(e) => set('summary', e.target.value)}
        />
      </div>
    </div>
  );
}
