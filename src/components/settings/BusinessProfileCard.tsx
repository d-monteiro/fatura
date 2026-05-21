import { useState, useMemo, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { SECTORS, EU_COUNTRIES, CURRENCIES } from '@/components/onboarding/onboardingTypes';
import { extractLogoColors } from '@/lib/utils/extractLogoColors';
import { Briefcase, Check, ImagePlus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Form {
  name: string;
  nif: string;
  sector: string;
  country: string;
  currency: string;
  primary_color: string;
  secondary_color: string;
  logo_url: string | null;
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
  } : emptyForm(), [tenant]);

  const [form, setForm] = useState<Form>(initial);
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

  if (!tenant) return null;

  return (
    <div className="border border-border rounded-xl p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Briefcase size={20} />
        <h2 className="text-lg font-semibold">Perfil do negócio</h2>
      </div>

      <div className="space-y-1.5">
        <Label>Logótipo</Label>
        <div className="flex items-center gap-3 rounded-lg border border-dashed border-gray-300 bg-gray-50/50 p-3">
          <div className="h-16 w-16 rounded-lg overflow-hidden bg-white border shadow-sm flex items-center justify-center shrink-0">
            {form.logo_url
              ? <img src={form.logo_url} alt="Logo" className="max-h-full max-w-full object-contain" />
              : <ImagePlus className="h-6 w-6 text-gray-300" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground">
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
        <div className="space-y-1.5">
          <Label htmlFor="bp-name">Nome da empresa *</Label>
          <Input
            id="bp-name"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bp-nif">NIF</Label>
          <Input
            id="bp-nif"
            className="font-mono"
            value={form.nif}
            onChange={(e) => setForm((p) => ({ ...p, nif: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Setor</Label>
          <Select value={form.sector} onValueChange={(v) => setForm((p) => ({ ...p, sector: v }))}>
            <SelectTrigger><SelectValue placeholder="Selecione um setor" /></SelectTrigger>
            <SelectContent>
              {SECTORS.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>País</Label>
          <Select value={form.country} onValueChange={(v) => setForm((p) => ({ ...p, country: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {EU_COUNTRIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Moeda</Label>
          <Select value={form.currency} onValueChange={(v) => setForm((p) => ({ ...p, currency: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <ColorInput label="Cor primária" value={form.primary_color} onChange={(v) => setForm((p) => ({ ...p, primary_color: v }))} />
          <ColorInput label="Cor secundária" value={form.secondary_color} onChange={(v) => setForm((p) => ({ ...p, secondary_color: v }))} />
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
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex gap-1.5">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-10 rounded-md border border-input cursor-pointer shrink-0"
          aria-label={label}
        />
        <Input
          className="font-mono uppercase"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </div>
  );
}
