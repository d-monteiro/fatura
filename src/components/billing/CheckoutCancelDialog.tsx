import { useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useTenant } from '@/contexts/TenantContext';
import { notifySlack } from '@/lib/slack/notify';
import { CalendarClock, LifeBuoy, ArrowLeft, Send, CheckCircle2, AlertCircle } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type View = 'menu' | 'ticket' | 'meeting' | 'sent';

const AVAILABILITY_OPTIONS = [
  'Manhãs (9h-12h)',
  'Tardes (14h-18h)',
  'Fins de tarde (17h-19h)',
  'Qualquer horário',
] as const;

export function CheckoutCancelDialog({ open, onOpenChange }: Props) {
  const { user } = useAuth();
  const { tenant } = useTenant();
  const [view, setView] = useState<View>('menu');
  const [sentMode, setSentMode] = useState<'ticket' | 'meeting' | null>(null);

  const [ticketDesc, setTicketDesc] = useState('');

  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [availability, setAvailability] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [website, setWebsite] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setView('menu');
    setSentMode(null);
    setTicketDesc('');
    setContactName('');
    setPhone('');
    setAvailability([]);
    setNotes('');
    setWebsite('');
    setError(null);
    setSubmitting(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const toggleAvailability = (slot: string) => {
    setAvailability((prev) =>
      prev.includes(slot) ? prev.filter((s) => s !== slot) : [...prev, slot],
    );
  };

  const submitTicket = async () => {
    if (!user || !tenant || !ticketDesc.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const { data: ticket, error: insertErr } = await supabase
        .from('tickets')
        .insert({
          tenant_id: tenant.id,
          user_id: user.id,
          subject: 'Problema no checkout',
          description: ticketDesc.trim(),
          category: 'billing',
          priority: 'high',
          page_url: window.location.href,
          browser_info: { userAgent: navigator.userAgent },
        })
        .select('id')
        .single();

      if (insertErr) throw insertErr;
      if (ticket) {
        void notifySlack({
          channel: 'tickets',
          payload: {
            tenant_name: tenant.name,
            subject: 'Problema no checkout',
            category: 'billing',
            priority: 'high',
            email: user.email ?? '',
            description: ticketDesc.trim(),
            ticket_id: ticket.id,
          },
        });
      }
      setSentMode('ticket');
      setView('sent');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao submeter.');
    } finally {
      setSubmitting(false);
    }
  };

  const submitMeeting = async () => {
    if (!tenant || !contactName.trim() || availability.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      if (!supabaseUrl || !anonKey) throw new Error('Configuração em falta');

      const prefix = '[Origem: checkout cancelado]';
      const body = {
        company_name: tenant.name,
        contact_name: contactName.trim(),
        email: user?.email ?? '',
        phone: phone.trim() || null,
        sector: tenant.sector ?? null,
        country: tenant.country,
        invoices_per_month: null,
        availability: availability.join(', '),
        notes: notes.trim() ? `${prefix}\n${notes.trim()}` : prefix,
        website,
      };

      const resp = await fetch(`${supabaseUrl}/functions/v1/submit-enterprise-lead`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: anonKey },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        const detail = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
        throw new Error(detail.error ?? 'Falha ao enviar.');
      }

      setSentMode('meeting');
      setView('sent');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao submeter.');
    } finally {
      setSubmitting(false);
    }
  };

  const ticketValid = ticketDesc.trim().length >= 10;
  const meetingValid = contactName.trim().length >= 2 && availability.length > 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-xl">
        {view === 'menu' && (
          <Menu onTicket={() => setView('ticket')} onMeeting={() => setView('meeting')} />
        )}

        {view === 'ticket' && (
          <div className="space-y-5">
            <StepHeader
              title="Reportar um problema"
              description="Descreva o que aconteceu. Respondemos por email assim que possível."
              onBack={() => setView('menu')}
            />
            <div className="space-y-2">
              <Label htmlFor="ticket-desc">O que aconteceu? *</Label>
              <Textarea
                id="ticket-desc"
                value={ticketDesc}
                onChange={(e) => setTicketDesc(e.target.value)}
                placeholder="Ex: o Stripe rejeitou o meu cartão, apareceu um erro, não consegui completar…"
                rows={5}
              />
              <p className="text-xs text-muted-foreground">Mínimo 10 caracteres.</p>
            </div>
            {error && <ErrorBox message={error} />}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setView('menu')}>Voltar</Button>
              <Button onClick={submitTicket} disabled={!ticketValid || submitting} className="gap-2">
                <Send className="h-4 w-4" />
                {submitting ? 'A enviar…' : 'Enviar ticket'}
              </Button>
            </div>
          </div>
        )}

        {view === 'meeting' && (
          <div className="space-y-5">
            <StepHeader
              title="Marcar uma reunião"
              description="Deixe os contactos e a nossa equipa agenda em 24h úteis."
              onBack={() => setView('menu')}
            />
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="contact-name">Nome de contacto *</Label>
                <Input
                  id="contact-name"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="Nome e apelido"
                />
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
                <Label>Disponibilidade *</Label>
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
                <Label htmlFor="meeting-notes">Notas (opcional)</Label>
                <Textarea
                  id="meeting-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Algo específico que queira discutir?"
                  rows={3}
                />
              </div>
              {error && <ErrorBox message={error} />}
              <div aria-hidden="true" className="absolute -left-[9999px] top-0 h-0 w-0 overflow-hidden">
                <label htmlFor="website-hp-billing">Website (deixar vazio)</label>
                <input
                  id="website-hp-billing"
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setView('menu')}>Voltar</Button>
              <Button onClick={submitMeeting} disabled={!meetingValid || submitting} className="gap-2">
                <Send className="h-4 w-4" />
                {submitting ? 'A enviar…' : 'Pedir reunião'}
              </Button>
            </div>
          </div>
        )}

        {view === 'sent' && (
          <Sent mode={sentMode} onClose={() => handleOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Menu({ onTicket, onMeeting }: { onTicket: () => void; onMeeting: () => void }) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center text-center gap-3">
        <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
          <AlertCircle className="h-7 w-7 text-primary" />
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Checkout cancelado</h2>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-sm mx-auto">
            Teve algum erro ou dúvida durante o pagamento? Estamos aqui para ajudar.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <OptionCard
          icon={<LifeBuoy className="h-6 w-6 text-primary" />}
          title="Reportar um problema"
          description="Abrir um ticket se encontrou um erro técnico no checkout."
          onClick={onTicket}
        />
        <OptionCard
          icon={<CalendarClock className="h-6 w-6 text-primary" />}
          title="Falar connosco"
          description="Marcar uma reunião curta para esclarecer dúvidas sobre o plano."
          onClick={onMeeting}
        />
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Ou volte a tentar o checkout abaixo quando estiver pronto.
      </p>
    </div>
  );
}

function OptionCard({
  icon, title, description, onClick,
}: { icon: React.ReactNode; title: string; description: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative rounded-xl border bg-card p-5 text-left transition-all hover:border-primary hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
    >
      <div className="mb-3">{icon}</div>
      <h3 className="font-semibold">{title}</h3>
      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{description}</p>
    </button>
  );
}

function StepHeader({ title, description, onBack }: { title: string; description: string; onBack: () => void }) {
  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-2"
      >
        <ArrowLeft className="h-3 w-3" /> Voltar
      </button>
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <p className="text-sm text-muted-foreground mt-1">{description}</p>
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
      {message}
    </div>
  );
}

function Sent({ mode, onClose }: { mode: 'ticket' | 'meeting' | null; onClose: () => void }) {
  const isMeeting = mode === 'meeting';
  return (
    <div className="flex flex-col items-center text-center gap-3 py-4">
      <div className="h-14 w-14 rounded-full bg-green-500/10 flex items-center justify-center">
        <CheckCircle2 className="h-7 w-7 text-green-600" />
      </div>
      <div>
        <h2 className="text-2xl font-bold tracking-tight">
          {isMeeting ? 'Pedido enviado' : 'Ticket criado'}
        </h2>
        <p className="text-sm text-muted-foreground mt-2 max-w-sm">
          {isMeeting
            ? 'Vamos contactá-lo em 24h úteis pelo email da sua conta.'
            : 'Recebemos o seu pedido. Respondemos por email assim que possível.'}
        </p>
      </div>
      <Button onClick={onClose} className="mt-2">Fechar</Button>
    </div>
  );
}
