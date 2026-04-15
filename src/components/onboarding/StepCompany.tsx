import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { ArrowLeftRight, Building2, Palette, Sparkles } from 'lucide-react';
import { SECTORS, EU_COUNTRIES, type OnboardingData } from './onboardingTypes';
import { LogoUploader } from './LogoUploader';
import { BrandPreview } from './BrandPreview';

interface Props {
  data: OnboardingData;
  onChange: (updates: Partial<OnboardingData>) => void;
}

export function StepCompany({ data, onChange }: Props) {
  return (
    <div className="space-y-10">
      <header className="space-y-2">
        <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-medium">
          <Sparkles className="h-3.5 w-3.5" />
          Vamos começar
        </div>
        <h2 className="text-3xl font-bold tracking-tight">A sua empresa</h2>
        <p className="text-muted-foreground">
          Uma configuração rápida — pode alterar tudo mais tarde em Definições.
        </p>
      </header>

      <section className="rounded-xl border bg-card shadow-sm">
        <div className="flex items-center gap-3 border-b bg-muted/30 rounded-t-xl px-5 py-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Building2 className="h-4 w-4" />
          </div>
          <div>
            <h3 className="font-semibold text-sm">Identificação</h3>
            <p className="text-xs text-muted-foreground">Dados fiscais e setor de atividade</p>
          </div>
        </div>
        <div className="p-6 md:p-8 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="companyName">Nome legal da empresa *</Label>
            <Input
              id="companyName"
              value={data.companyName}
              onChange={(e) => onChange({ companyName: e.target.value })}
              placeholder="Ex: Empresa Exemplo Lda"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="nif">NIF / Nº de IVA *</Label>
              <Input
                id="nif"
                value={data.nif}
                onChange={(e) => onChange({ nif: e.target.value })}
                placeholder="501234567"
              />
            </div>
            <div className="space-y-2">
              <Label>País *</Label>
              <Select value={data.country} onValueChange={(v) => onChange({ country: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EU_COUNTRIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Setor / Indústria *</Label>
            <Select value={data.sector} onValueChange={(v) => onChange({ sector: v })}>
              <SelectTrigger><SelectValue placeholder="Escolher um setor" /></SelectTrigger>
              <SelectContent>
                {SECTORS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {data.sector === 'autre' && (
              <Input
                value={data.sectorCustom}
                onChange={(e) => onChange({ sectorCustom: e.target.value })}
                placeholder="Especifique o seu setor"
                className="mt-2"
              />
            )}
          </div>
        </div>
      </section>

      <section className="rounded-xl border bg-card shadow-sm">
        <div className="flex items-center gap-3 border-b bg-muted/30 rounded-t-xl px-5 py-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Palette className="h-4 w-4" />
          </div>
          <div>
            <h3 className="font-semibold text-sm">Identidade visual</h3>
            <p className="text-xs text-muted-foreground">A sua marca aplicada em toda a aplicação</p>
          </div>
        </div>
        <div className="p-6 md:p-8 grid gap-8 lg:grid-cols-[1fr_300px]">
          <div className="space-y-5">
            <LogoUploader
              value={data.logoDataUrl}
              onChange={(url) => onChange({ logoDataUrl: url })}
              onPaletteExtracted={({ primary, secondary }) =>
                onChange({ primaryColor: primary, secondaryColor: secondary })
              }
            />
            <div className="flex items-end gap-2">
              <ColorField
                id="primaryColor"
                label="Cor primária"
                value={data.primaryColor}
                onChange={(v) => onChange({ primaryColor: v })}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() =>
                  onChange({ primaryColor: data.secondaryColor, secondaryColor: data.primaryColor })
                }
                title="Trocar cores"
                aria-label="Trocar cores"
                className="shrink-0 mb-0.5 hover:bg-primary/5 hover:border-primary/50 transition-colors"
              >
                <ArrowLeftRight className="h-4 w-4" />
              </Button>
              <ColorField
                id="secondaryColor"
                label="Cor secundária"
                value={data.secondaryColor}
                onChange={(v) => onChange({ secondaryColor: v })}
              />
            </div>
          </div>
          <BrandPreview
            logo={data.logoDataUrl}
            primary={data.primaryColor}
            secondary={data.secondaryColor}
            name={data.companyName || 'A sua empresa'}
          />
        </div>
      </section>
    </div>
  );
}

function ColorField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex-1 space-y-2 min-w-0">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2 items-center">
        <input
          type="color"
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-10 rounded-md border cursor-pointer shrink-0"
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="font-mono text-sm uppercase"
        />
      </div>
    </div>
  );
}
