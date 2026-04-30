import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { useI18n } from '@/contexts/I18nContext';
import type { Supplier } from '@/types/database';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { normalizeNifPT, isValidNifPT } from '@/lib/utils/nif';

interface Props {
  supplier: Supplier;
  onCancel: () => void;
  onSaved: () => void;
}

interface FormState {
  name: string; nif: string; iban: string; address: string;
  is_subcontractor: boolean;
}
type FieldKey = Exclude<keyof FormState, 'is_subcontractor'>;

function Field({ id, label, field, value, mono, onChange }: {
  id: string; label: string; field: FieldKey; value: string; mono?: boolean;
  onChange: (field: FieldKey, value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        className={mono ? 'font-mono' : undefined}
        value={value}
        onChange={(e) => onChange(field, e.target.value)}
      />
    </div>
  );
}

export function SupplierEditForm({ supplier, onCancel, onSaved }: Props) {
  const { t } = useI18n();
  const [form, setForm] = useState<FormState>({
    name: supplier.display_name ?? supplier.name,
    nif: supplier.nif ?? '',
    iban: supplier.iban ?? '',
    address: supplier.address ?? '',
    is_subcontractor: supplier.is_subcontractor,
  });
  const [error, setError] = useState('');

  const updateString = (field: FieldKey, value: string) => setForm((p) => ({ ...p, [field]: value }));

  const nifNormalized = normalizeNifPT(form.nif);
  const nifFilled = form.nif.trim().length > 0;
  const nifWarn = nifFilled && (!nifNormalized || !isValidNifPT(nifNormalized));

  const mutation = useMutation({
    mutationFn: async () => {
      // Não bloqueamos NIF inválido — Gemini extrai a vezes mal e o utilizador
      // precisa de guardar para depois corrigir. Apenas avisamos visualmente.
      // S4: se o user escreve um NIF parcial (<9 dígitos) preservamos o raw
      // em vez de gravar null e perder o NIF que estava antes.
      const trimmed = form.nif.trim();
      const nifToSave = nifNormalized ?? (trimmed ? trimmed : null);
      const { error: dbErr } = await supabase
        .from('suppliers')
        .update({
          display_name: form.name || null,
          nif: nifToSave,
          iban: form.iban || null,
          address: form.address || null,
          is_subcontractor: form.is_subcontractor,
          updated_at: new Date().toISOString(),
        })
        .eq('id', supplier.id);
      if (dbErr) {
        if (dbErr.code === '23505') {
          throw new Error('Já existe outro fornecedor com este NIF.');
        }
        throw dbErr;
      }
    },
    onSuccess: onSaved,
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="grid grid-cols-2 gap-3">
        <Field id={`sup-${supplier.id}-name`} label={t('sup.name')} field="name" value={form.name} onChange={updateString} />
        <div className="space-y-1.5">
          <Label htmlFor={`sup-${supplier.id}-nif`}>{t('inv.nif')}</Label>
          <Input
            id={`sup-${supplier.id}-nif`}
            className={`font-mono ${nifWarn ? 'border-amber-400 focus-visible:ring-amber-300' : ''}`}
            value={form.nif}
            onChange={(e) => updateString('nif', e.target.value)}
            placeholder="123 456 789"
          />
          {nifWarn && (
            <p className="text-xs text-amber-700">
              NIF inválido — verifica o último dígito. Será guardado mesmo assim.
            </p>
          )}
        </div>
        <Field id={`sup-${supplier.id}-iban`} label={t('sup.iban')} field="iban" value={form.iban} mono onChange={updateString} />
        <div className="col-span-2">
          <Field id={`sup-${supplier.id}-address`} label={t('sup.address')} field="address" value={form.address} onChange={updateString} />
        </div>
        <div className="col-span-2 flex items-end pb-1">
          <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_subcontractor}
              onChange={(e) => setForm((p) => ({ ...p, is_subcontractor: e.target.checked }))}
              className="rounded border-input"
            />
            {t('sup.subcontractor')}
          </label>
        </div>
      </div>
      <div className="flex gap-2 pt-2">
        <button onClick={() => mutation.mutate()} disabled={mutation.isPending} className="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:opacity-90 transition-all disabled:opacity-50">
          {mutation.isPending ? '...' : t('action.save')}
        </button>
        <button onClick={onCancel} className="rounded-lg border border-input px-4 py-1.5 text-sm font-medium text-foreground hover:bg-accent">
          {t('action.cancel')}
        </button>
      </div>
    </div>
  );
}
