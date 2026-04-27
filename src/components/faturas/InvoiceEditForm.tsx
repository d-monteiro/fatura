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

type TFn = (key: TranslationKey) => string;

interface FormData {
  supplier_name: string; supplier_nif: string; doc_number: string; doc_date: string;
  valor_sem_iva: string; valor_iva: string; valor_total: string; taxa_iva: string;
  category: string; summary: string;
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
  const { categories } = useCategories(tenant?.id);

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
          className="font-mono"
          value={form.supplier_nif}
          onChange={(e) => set('supplier_nif', e.target.value)}
        />
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
