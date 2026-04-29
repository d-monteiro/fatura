import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/supabase/client';
import { Mail, Phone, Building2 } from 'lucide-react';

type LeadStatus = 'new' | 'contacted' | 'converted' | 'declined';

interface Lead {
  id: string;
  created_at: string;
  company_name: string;
  contact_name: string;
  email: string;
  phone: string | null;
  sector: string | null;
  country: string | null;
  invoices_per_month: number | null;
  availability: string | null;
  notes: string | null;
  status: LeadStatus;
}

const STATUS_LABEL: Record<LeadStatus, string> = {
  new: 'Novo',
  contacted: 'Contactado',
  converted: 'Convertido',
  declined: 'Recusado',
};

const STATUS_VARIANT: Record<LeadStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  new: 'default',
  contacted: 'secondary',
  converted: 'outline',
  declined: 'destructive',
};

export default function AdminLeads() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');

  const { data: leads = [], isLoading } = useQuery<Lead[]>({
    queryKey: ['admin-enterprise-leads'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('enterprise_leads')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Lead[];
    },
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: LeadStatus }) => {
      const { error } = await supabase.from('enterprise_leads')
        .update({ status })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Estado atualizado');
      qc.invalidateQueries({ queryKey: ['admin-enterprise-leads'] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Erro a atualizar'),
  });

  const filtered = search.trim()
    ? leads.filter((l) => {
        const q = search.toLowerCase();
        return [l.company_name, l.contact_name, l.email, l.sector, l.country]
          .some((v) => v?.toLowerCase().includes(q));
      })
    : leads;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Leads empresariais</h1>
        <p className="text-sm text-muted-foreground">{leads.length} lead(s) registado(s)</p>
      </div>

      <Input
        placeholder="Pesquisar por empresa, contacto, email, setor..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-md"
      />

      {isLoading ? (
        <div className="text-muted-foreground">A carregar...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          {leads.length === 0 ? 'Sem leads de momento.' : 'Sem resultados.'}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              onStatusChange={(status) => statusMutation.mutate({ id: lead.id, status })}
              busy={statusMutation.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LeadCard({
  lead, onStatusChange, busy,
}: { lead: Lead; onStatusChange: (s: LeadStatus) => void; busy: boolean }) {
  const date = new Date(lead.created_at).toLocaleDateString('pt-PT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="font-semibold truncate">{lead.company_name}</span>
            <Badge variant={STATUS_VARIANT[lead.status]}>{STATUS_LABEL[lead.status] ?? lead.status}</Badge>
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            {lead.contact_name} · {date}
          </div>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 text-sm">
        <a href={`mailto:${lead.email}`} className="flex items-center gap-1.5 text-primary hover:underline">
          <Mail className="h-3.5 w-3.5" /> {lead.email}
        </a>
        {lead.phone && (
          <a href={`tel:${lead.phone}`} className="flex items-center gap-1.5 text-primary hover:underline">
            <Phone className="h-3.5 w-3.5" /> {lead.phone}
          </a>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-3 text-xs text-muted-foreground">
        {lead.sector && <div><span className="font-medium">Setor:</span> {lead.sector}</div>}
        {lead.country && <div><span className="font-medium">País:</span> {lead.country}</div>}
        {lead.invoices_per_month && <div><span className="font-medium">Volume:</span> ~{lead.invoices_per_month}/mês</div>}
        {lead.availability && <div className="col-span-full"><span className="font-medium">Disponibilidade:</span> {lead.availability}</div>}
      </div>

      {lead.notes && (
        <div className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground whitespace-pre-wrap">
          {lead.notes}
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        {(['new', 'contacted', 'converted', 'declined'] as LeadStatus[]).map((s) => (
          <Button
            key={s}
            size="sm"
            variant={lead.status === s ? 'default' : 'outline'}
            disabled={busy || lead.status === s}
            onClick={() => onStatusChange(s)}
          >
            {STATUS_LABEL[s]}
          </Button>
        ))}
      </div>
    </div>
  );
}
