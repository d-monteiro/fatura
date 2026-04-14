import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SECTORS, EU_COUNTRIES, type OnboardingData } from './onboardingTypes';

interface Props {
  data: OnboardingData;
  onChange: (updates: Partial<OnboardingData>) => void;
}

export function StepCompany({ data, onChange }: Props) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">A sua empresa</h2>
        <p className="text-muted-foreground mt-1">Informações básicas para configurar a sua conta.</p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="companyName">Nome legal da empresa *</Label>
          <Input
            id="companyName"
            value={data.companyName}
            onChange={(e) => onChange({ companyName: e.target.value })}
            placeholder="Ex: Empresa Exemplo Lda"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="nif">NIF / Número de IVA *</Label>
          <Input
            id="nif"
            value={data.nif}
            onChange={(e) => onChange({ nif: e.target.value })}
            placeholder="Ex: FR12345678901"
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

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="primaryColor">Cor primária</Label>
            <div className="flex gap-2 items-center">
              <input
                type="color"
                id="primaryColor"
                value={data.primaryColor}
                onChange={(e) => onChange({ primaryColor: e.target.value })}
                className="h-10 w-10 rounded border cursor-pointer"
              />
              <Input
                value={data.primaryColor}
                onChange={(e) => onChange({ primaryColor: e.target.value })}
                className="font-mono text-sm"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="secondaryColor">Cor secundária</Label>
            <div className="flex gap-2 items-center">
              <input
                type="color"
                id="secondaryColor"
                value={data.secondaryColor}
                onChange={(e) => onChange({ secondaryColor: e.target.value })}
                className="h-10 w-10 rounded border cursor-pointer"
              />
              <Input
                value={data.secondaryColor}
                onChange={(e) => onChange({ secondaryColor: e.target.value })}
                className="font-mono text-sm"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
