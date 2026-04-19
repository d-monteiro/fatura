import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Send, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { track } from '@/lib/analytics/track';
import { EVENTS } from '@/lib/analytics/events';
import type { OnboardingData } from './onboardingTypes';
import { SECTORS } from './onboardingTypes';

interface Props {
  data: OnboardingData;
  onBack: () => void;
  onSubmitted: () => void;
}

const AVAILABILITY_OPTIONS = [
  'Manhãs (9h-12h)',
  'Tardes (14h-18h)',
  'Fins de tarde (17h-19h)',
  'Qualquer horário',
] as const;

export function EnterpriseContactForm({ data, onBack, onSubmitted }: Props) {
  const { user } = useAuth();
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState(user?.email ?? '');
  const [phone, setPhone] = useState('');
  const [availability, setAvailability] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [website, setWebsite] = useState(''); // honeypot: bot-only
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleAvailability = (slot: string) => {
    setAvailability((prev) =>
      prev.includes(slot) ? prev.filter((s) => s !== slot) : [...prev, slot],
    );
  };

  const emailValid = /\S+@\S+\.\S+/.test(email.trim());
  const isValid = contactName.trim().length >= 2 && emailValid && availability.length > 0;

  const handleSubmit = async () => {
    if (!isValid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const sectorLabel = SECTORS.find((s) => s.value === data.sector)?.label
        ?? data.sectorCustom
        ?? data.sector;
      const availabilityStr = availability.join(', ');
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      if (!supabaseUrl || !anonKey) throw new Error('Config em falta');

      const resp = await fetch(`${supabaseUrl}/functions/v1/submit-enterprise-lead`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': anonKey,
        },
        body: JSON.stringify({
          company_name: data.companyName,
          contact_name: contactName.trim(),
          email: email.trim(),
          phone: phone.trim() || null,
          sector: sectorLabel,
          country: data.country,
          invoices_per_month: data.invoicesPerMonth,
          availability: availabilityStr,
          notes: notes.trim() || null,
          website, // honeypot
        }),
      });

      if (!resp.ok) {
        const detail = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
        throw new Error(detail.error ?? 'Falha ao enviar.');
      }

      track(EVENTS.ONBOARDING_ENTERPRISE_CONTACT_SUBMITTED, {
        country: data.country,
        sector: data.sector,
        invoices_per_month: data.invoicesPerMonth,
        availability_count: availability.length,
      });
      onSubmitted();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao enviar o pedido.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Plano Empresarial</h2>
        <p className="text-muted-foreground mt-1">
          Deixe os seus contactos e a nossa equipa agendará uma reunião nas próximas 24 horas úteis.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="contactName">Nome de contacto *</Label>
          <Input
            id="contactName"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            placeholder="Nome e apelido"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="contactEmail">Email *</Label>
          <Input
            id="contactEmail"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nome@empresa.pt"
            disabled={!!user?.email}
          />
          {user?.email && (
            <p className="text-xs text-muted-foreground">Email da conta já autenticada.</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone">Telefone</Label>
          <Input
            id="phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+351 912 345 678"
          />
        </div>

        <div className="space-y-2">
          <Label>Disponibilidade para reunião *</Label>
          <div className="flex flex-wrap gap-1.5">
            {AVAILABILITY_OPTIONS.map((slot) => (
              <button
                key={slot}
                type="button"
                onClick={() => toggleAvailability(slot)}
                className={`inline-flex items-center rounded-full border px-3 py-1 text-xs transition-colors ${
                  availability.includes(slot)
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background border-border hover:border-primary/50'
                }`}
              >
                {slot}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="notes">Notas (opcional)</Label>
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Algo específico que queira mencionar? (ex: integração necessária, número de utilizadores, timeline...)"
            rows={4}
          />
        </div>

        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Honeypot: invisível para humanos, preenchido por bots */}
        <div aria-hidden="true" className="absolute -left-[9999px] top-0 h-0 w-0 overflow-hidden">
          <label htmlFor="website-hp">Website (deixar vazio)</label>
          <input
            id="website-hp"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </div>
      </div>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack} disabled={submitting} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Voltar aos planos
        </Button>
        <Button onClick={handleSubmit} disabled={!isValid || submitting} className="gap-2">
          <Send className="h-4 w-4" />
          {submitting ? 'A enviar...' : 'Enviar pedido'}
        </Button>
      </div>
    </div>
  );
}
