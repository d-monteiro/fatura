import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { type OnboardingData } from './onboardingTypes';
import { X, Plus, Mail } from 'lucide-react';

interface Props {
  data: OnboardingData;
  onChange: (updates: Partial<OnboardingData>) => void;
}

export function StepAutomation({ data, onChange }: Props) {
  const [emailInput, setEmailInput] = useState('');

  const addEmail = () => {
    const trimmed = emailInput.trim();
    if (trimmed && trimmed.includes('@') && !data.emailAddresses.includes(trimmed)) {
      onChange({ emailAddresses: [...data.emailAddresses, trimmed] });
      setEmailInput('');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Automação e email</h2>
        <p className="text-muted-foreground mt-1">Configure a importação automática de faturas por email.</p>
      </div>

      <div className="space-y-4">
        <label className="flex items-center justify-between p-4 rounded-lg border cursor-pointer hover:bg-muted/50">
          <div className="flex items-center gap-3">
            <Mail className="h-5 w-5 text-primary" />
            <div>
              <div className="font-medium text-sm">Importação automática por email</div>
              <div className="text-xs text-muted-foreground">
                As faturas recebidas por email serão processadas automaticamente
              </div>
            </div>
          </div>
          <input
            type="checkbox"
            checked={data.emailSync}
            onChange={(e) => onChange({ emailSync: e.target.checked })}
            className="rounded h-5 w-5"
          />
        </label>

        {data.emailSync && (
          <div className="space-y-2 pl-1">
          <Label>Endereços de email onde recebe faturas</Label>
            <div className="flex gap-2">
              <Input
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addEmail())}
                placeholder="comptabilite@votre-entreprise.com"
              />
              <Button type="button" variant="outline" size="icon" onClick={addEmail}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {data.emailAddresses.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {data.emailAddresses.map((email, i) => (
                  <Badge key={i} variant="secondary" className="gap-1">
                    {email}
                    <button
                      type="button"
                      onClick={() => onChange({
                        emailAddresses: data.emailAddresses.filter((_, idx) => idx !== i),
                      })}
                      className="hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
