import { Label } from '@/components/ui/label';
import { type OnboardingData } from './onboardingTypes';
import { HardDrive, Cloud } from 'lucide-react';

interface Props {
  data: OnboardingData;
  onChange: (updates: Partial<OnboardingData>) => void;
}

export function StepStorage({ data, onChange }: Props) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Organização e armazenamento</h2>
        <p className="text-muted-foreground mt-1">Onde pretende guardar os seus ficheiros de faturas?</p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Fornecedor de armazenamento</Label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => onChange({ storageProvider: 'google_drive' })}
              className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-colors ${
                data.storageProvider === 'google_drive'
                  ? 'border-primary bg-primary/5'
                  : 'border-muted hover:border-primary/50'
              }`}
            >
              <Cloud className="h-8 w-8" />
              <span className="font-medium text-sm">Google Drive</span>
            </button>
            <button
              type="button"
              disabled
              aria-disabled
              className="flex flex-col items-center gap-2 p-4 rounded-lg border-2 border-muted bg-muted/20 opacity-60 cursor-not-allowed"
            >
              <HardDrive className="h-8 w-8 text-muted-foreground" />
              <span className="font-medium text-sm text-muted-foreground">OneDrive</span>
              <span className="text-xs text-muted-foreground">(Em breve)</span>
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <label className="flex items-center justify-between p-3 rounded-lg border cursor-pointer hover:bg-muted/50">
            <div>
              <div className="font-medium text-sm">Extrato automático em Sheets / Excel</div>
              <div className="text-xs text-muted-foreground">Sincroniza cada fatura numa folha de cálculo</div>
            </div>
            <input
              type="checkbox"
              checked={data.autoSheets}
              onChange={(e) => onChange({ autoSheets: e.target.checked })}
              className="rounded h-5 w-5"
            />
          </label>
        </div>

        <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 space-y-1">
          <p className="text-xs text-primary">Pastas organizadas por ano e mês. Editável em Definições.</p>
          <p className="text-xs text-primary">A ligação ao Google acontece após criar a conta.</p>
        </div>
      </div>
    </div>
  );
}
