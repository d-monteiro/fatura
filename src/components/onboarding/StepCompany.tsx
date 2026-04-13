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
        <h2 className="text-2xl font-bold">Votre entreprise</h2>
        <p className="text-muted-foreground mt-1">Informations de base pour configurer votre compte.</p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="companyName">Nom légal de l'entreprise *</Label>
          <Input
            id="companyName"
            value={data.companyName}
            onChange={(e) => onChange({ companyName: e.target.value })}
            placeholder="Ex: Dupont Construction SARL"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="nif">NIF / Numéro de TVA *</Label>
          <Input
            id="nif"
            value={data.nif}
            onChange={(e) => onChange({ nif: e.target.value })}
            placeholder="Ex: FR12345678901"
          />
        </div>

        <div className="space-y-2">
          <Label>Pays *</Label>
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
          <Label>Secteur / Industrie *</Label>
          <Select value={data.sector} onValueChange={(v) => onChange({ sector: v })}>
            <SelectTrigger><SelectValue placeholder="Choisir un secteur" /></SelectTrigger>
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
              placeholder="Précisez votre secteur"
              className="mt-2"
            />
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="primaryColor">Couleur primaire</Label>
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
            <Label htmlFor="secondaryColor">Couleur secondaire</Label>
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
