import { useState, useMemo, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { SECTORS, EU_COUNTRIES, CURRENCIES } from '@/components/onboarding/onboardingTypes';
import { extractLogoColors } from '@/lib/utils/extractLogoColors';
import { Briefcase, Plus, X, Check, ImagePlus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface Form {
  name: string;
  nif: string;
  sector: string;
  country: string;
  currency: string;
  primary_color: string;
  secondary_color: string;
  logo_url: string | null;
  invoice_name_variations: string[];
}

function emptyForm(): Form {
  return {
    name: '',
    nif: '',
    sector: '',
    country: 'PT',
    currency: 'EUR',
    primary_color: '#0E2435',
    secondary_color: '#BBB388',
    logo_url: null,
    invoice_name_variations: [],
  };
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Falha ao ler ficheiro'));
    reader.readAsDataURL(file);
  });
}

const inputCls = 'w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20';

export function BusinessProfileCard() {
  const { tenant, refreshTenant } = useTenant();

  const initial = useMemo<Form>(() => tenant ? {
    name: tenant.name,
    nif: tenant.nif ?? '',
    sector: tenant.sector ?? '',
    country: tenant.country,
    currency: tenant.currency,
    primary_color: tenant.primary_color,
    secondary_color: tenant.secondary_color,
    logo_url: tenant.logo_url,
    invoice_name_variations: tenant.invoice_name_variations ?? [],
  } : emptyForm(), [tenant]);

  const [form, setForm] = useState<Form>(initial);
  const [variationDraft, setVariationDraft] = useState('');
  const [logoBusy, setLogoBusy] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const dirty = JSON.stringify(form) !== JSON.stringify(initial);

  const save = useMutation({
    mutationFn: async () => {
      if (!tenant?.id) throw new Error('Sem tenant activo');
      const nifClean = form.nif.replace(/\s/g, '');
      if (nifClean && !/^\d{9}$/.test(nifClean)) throw new Error('NIF deve ter 9 dígitos');
      if (!form.name.trim()) throw new Error('Nome é obrigatório');

      const { error } = await supabase.from('tenants').update({
        name: form.name.trim(),
        nif: nifClean || null,
        sector: form.sector || null,
        country: form.country,
        currency: form.currency,
        primary_color: form.primary_color,
        secondary_color: form.secondary_color,
        logo_url: form.logo_url,
        invoice_name_variations: form.invoice_name_variations,
        updated_at: new Date().toISOString(),
      }).eq('id', tenant.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await refreshTenant();
      toast.success('Perfil guardado');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleLogoFile = async (file: File) => {
    if (!file.type.startsWith('image/')) { toast.error('Só ficheiros de imagem'); return; }
    if (file.size > 2 * 1024 * 1024) { toast.error('Máx. 2MB'); return; }
    setLogoBusy(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      const palette = await extractLogoColors(dataUrl);
      setForm((p) => ({
        ...p,
        logo_url: dataUrl,
        primary_color: palette?.primary ?? p.primary_color,
        secondary_color: palette?.secondary ?? p.secondary_color,
      }));
    } catch {
      toast.error('Falha ao ler ficheiro');
    } finally {
      setLogoBusy(false);
    }
  };

  const addVariation = () => {
    const v = variationDraft.trim();
    if (!v || form.invoice_name_variations.includes(v)) return;
    setForm((p) => ({ ...p, invoice_name_variations: [...p.invoice_name_variations, v] }));
    setVariationDraft('');
  };

  const removeVariation = (v: string) =>
    setForm((p) => ({ ...p, invoice_name_variations: p.invoice_name_variations.filter((x) => x !== v) }));

  if (!tenant) return null;

  return (
    <div className="border border-border rounded-xl p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Briefcase size={20} />
        <h2 className="text-lg font-semibold">Perfil do negócio</h2>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Logótipo</label>
        <div className="flex items-center gap-3 rounded-lg border border-dashed border-gray-300 bg-gray-50/50 p-3">
          <div className="h-16 w-16 rounded-lg overflow-hidden bg-white border shadow-sm flex items-center justify-center shrink-0">
            {form.logo_url
              ? <img src={form.logo_url} alt="Logo" className="max-h-full max-w-full object-contain" />
              : <ImagePlus className="h-6 w-6 text-gray-300" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-500">
              {form.logo_url ? 'Logo atual. Ao trocar, extraímos a paleta automaticamente.' : 'PNG, JPG ou SVG. Máx. 2MB.'}
            </p>
          </div>
          <div className="flex gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => logoInputRef.current?.click()}
              disabled={logoBusy}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <ImagePlus className="h-3.5 w-3.5" /> {form.logo_url ? 'Trocar' : 'Carregar'}
            </button>
            {form.logo_url && (
              <button
                type="button"
                onClick={() => setForm((p) => ({ ...p, logo_url: null }))}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 className="h-3.5 w-3.5" /> Remover
              </button>
            )}
          </div>
          <input
            ref={logoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleLogoFile(f);
              e.target.value = '';
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Nome da empresa *</label>
          <input className={inputCls} value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">NIF</label>
          <input className={`${inputCls} font-mono`} value={form.nif} onChange={(e) => setForm((p) => ({ ...p, nif: e.target.value }))} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Setor</label>
          <select className={inputCls} value={form.sector} onChange={(e) => setForm((p) => ({ ...p, sector: e.target.value }))}>
            <option value="">—</option>
            {SECTORS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">País</label>
          <select className={inputCls} value={form.country} onChange={(e) => setForm((p) => ({ ...p, country: e.target.value }))}>
            {EU_COUNTRIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Moeda</label>
          <select className={inputCls} value={form.currency} onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value }))}>
            {CURRENCIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <ColorInput label="Cor primária" value={form.primary_color} onChange={(v) => setForm((p) => ({ ...p, primary_color: v }))} />
          <ColorInput label="Cor secundária" value={form.secondary_color} onChange={(v) => setForm((p) => ({ ...p, secondary_color: v }))} />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Nomes nas faturas recebidas</label>
        <p className="text-xs text-gray-400 mb-2">Variações do nome da sua empresa como aparecem nas faturas (ex: abreviaturas, marcas). A IA usa isto para identificar o destinatário.</p>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {form.invoice_name_variations.map((v) => (
            <span key={v} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs text-primary">
              {v}
              <button onClick={() => removeVariation(v)} className="hover:text-red-600"><X className="h-3 w-3" /></button>
            </span>
          ))}
          {form.invoice_name_variations.length === 0 && <span className="text-xs text-gray-400">Nenhuma ainda.</span>}
        </div>
        <div className="flex gap-2">
          <input
            className={inputCls}
            value={variationDraft}
            onChange={(e) => setVariationDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addVariation(); } }}
            placeholder="Ex: Flowzi, Flowzi Lda, FZI"
          />
          <button
            type="button"
            onClick={addVariation}
            disabled={!variationDraft.trim()}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" /> Adicionar
          </button>
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <button
          onClick={() => save.mutate()}
          disabled={!dirty || save.isPending}
          className="inline-flex items-center gap-1 rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          <Check className="h-3.5 w-3.5" /> {save.isPending ? 'A guardar...' : 'Guardar'}
        </button>
      </div>
    </div>
  );
}

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <div className="flex gap-1.5">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-8 w-8 rounded border border-gray-300 cursor-pointer shrink-0" />
        <input className={`${inputCls} font-mono uppercase`} value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
    </div>
  );
}
