import type { TranslationKey } from '@/lib/i18n';
import { COST_TYPES, COST_TYPE_LABELS } from '@/lib/constants';
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
  montant_ht: string; montant_tva: string; montant_ttc: string; taux_tva: string;
  metier: string; nature_depense: string; cost_type: string; summary: string;
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
  const metierOptions = categories.metier;
  const natureOptions = categories.nature_depense;

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
          <Label htmlFor="ie-ht">{t('inv.amount_ht')}</Label>
          <Input
            id="ie-ht"
            type="number"
            step="0.01"
            value={form.montant_ht}
            onChange={(e) => set('montant_ht', e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ie-tva">{t('inv.tva')}</Label>
          <Input
            id="ie-tva"
            type="number"
            step="0.01"
            value={form.montant_tva}
            onChange={(e) => set('montant_tva', e.target.value)}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="ie-ttc">{t('inv.amount_ttc')}</Label>
          <Input
            id="ie-ttc"
            type="number"
            step="0.01"
            value={form.montant_ttc}
            onChange={(e) => set('montant_ttc', e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ie-tva-rate">{t('inv.tva_rate')} (%)</Label>
          <Input
            id="ie-tva-rate"
            type="number"
            step="0.1"
            value={form.taux_tva}
            onChange={(e) => set('taux_tva', e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>{t('inv.metier')}</Label>
        <Select value={form.metier} onValueChange={(v) => set('metier', v)}>
          <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
          <SelectContent>
            {metierOptions.map((c) => (
              <SelectItem key={c.id} value={c.code}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>{t('inv.nature')}</Label>
        <Select value={form.nature_depense} onValueChange={(v) => set('nature_depense', v)}>
          <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
          <SelectContent>
            {natureOptions.map((c) => (
              <SelectItem key={c.id} value={c.code}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>{t('inv.cost_type')}</Label>
        <Select value={form.cost_type} onValueChange={(v) => set('cost_type', v)}>
          <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
          <SelectContent>
            {COST_TYPES.map((c) => (
              <SelectItem key={c} value={c}>{COST_TYPE_LABELS[c]}</SelectItem>
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
