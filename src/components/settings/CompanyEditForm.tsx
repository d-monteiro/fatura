import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { Check, X, Plus } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import type { Company } from '@/types/database';
import { queryKeys } from '@/lib/queryKeys';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface CompanyEditFormProps {
  company: Company;
  onDone: () => void;
}

// Editor único de empresa — usado por todas as empresas do tenant, principal
// ou secundária. Cobre os campos que pesam no processamento de faturas.
export function CompanyEditForm({ company: c, onDone }: CompanyEditFormProps) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: c.name,
    short_name: c.short_name,
    nif: c.nif ?? '',
    address: c.address ?? '',
    email: c.email ?? '',
    invoice_name_variations: c.invoice_name_variations ?? [],
  });
  const [variationDraft, setVariationDraft] = useState('');
  const [error, setError] = useState('');

  const update = useMutation({
    mutationFn: async () => {
      const name = form.name.trim();
      if (!name) throw new Error('Nome é obrigatório');
      const shortName = form.short_name.trim()
        || name.split(/\s+/)[0].toUpperCase().slice(0, 16);
      const { error: dbErr } = await supabase.from('companies').update({
        name,
        short_name: shortName,
        nif: form.nif.replace(/\s/g, '') || null,
        address: form.address.trim() || null,
        email: form.email.trim() || null,
        invoice_name_variations: form.invoice_name_variations,
      }).eq('id', c.id);
      if (dbErr) throw dbErr;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.companies }); onDone(); },
    onError: (e: Error) => setError(e.message),
  });

  const addVariation = () => {
    const v = variationDraft.trim();
    if (!v || form.invoice_name_variations.includes(v)) return;
    setForm((p) => ({ ...p, invoice_name_variations: [...p.invoice_name_variations, v] }));
    setVariationDraft('');
  };
  const removeVariation = (v: string) =>
    setForm((p) => ({ ...p, invoice_name_variations: p.invoice_name_variations.filter((x) => x !== v) }));

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-card space-y-3">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor={`c-${c.id}-name`}>{t('company.name')}</Label>
          <Input id={`c-${c.id}-name`} value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`c-${c.id}-short`}>Nome curto</Label>
          <Input id={`c-${c.id}-short`} maxLength={16} value={form.short_name} onChange={(e) => setForm((p) => ({ ...p, short_name: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`c-${c.id}-nif`}>{t('company.nif')}</Label>
          <Input id={`c-${c.id}-nif`} className="font-mono" value={form.nif} onChange={(e) => setForm((p) => ({ ...p, nif: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`c-${c.id}-email`}>Email</Label>
          <Input id={`c-${c.id}-email`} type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
        </div>
        <div className="col-span-2 space-y-1">
          <Label htmlFor={`c-${c.id}-addr`}>{t('company.address')}</Label>
          <Input id={`c-${c.id}-addr`} value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Nomes nas faturas</Label>
        <p className="text-xs text-muted-foreground">
          Como esta empresa aparece como destinatária nas faturas recebidas. A IA usa isto para distinguir entre as empresas do tenant.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {form.invoice_name_variations.map((v) => (
            <span key={v} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs text-primary">
              {v}
              <button type="button" onClick={() => removeVariation(v)} className="hover:text-red-600"><X className="h-3 w-3" /></button>
            </span>
          ))}
          {form.invoice_name_variations.length === 0 && <span className="text-xs text-muted-foreground">Nenhuma ainda.</span>}
        </div>
        <div className="flex gap-2">
          <Input
            value={variationDraft}
            onChange={(e) => setVariationDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addVariation(); } }}
            placeholder="Ex: FASHIONVIANA, Fashion Viana Lda"
          />
          <button type="button" onClick={addVariation} disabled={!variationDraft.trim()}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 shrink-0">
            <Plus className="h-3.5 w-3.5" /> Adicionar
          </button>
        </div>
      </div>

      <div className="flex gap-2">
        <button onClick={() => update.mutate()} disabled={update.isPending}
          className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50">
          <Check className="h-3.5 w-3.5" /> {t('action.save')}
        </button>
        <button onClick={onDone}
          className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
          <X className="h-3.5 w-3.5" /> {t('action.cancel')}
        </button>
      </div>
    </div>
  );
}
