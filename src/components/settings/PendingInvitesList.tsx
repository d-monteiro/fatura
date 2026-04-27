import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Copy, X, Check, Loader2, Mail } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useTenantInvites } from '@/hooks/useTenantInvites';
import { queryKeys } from '@/lib/queryKeys';

const ROLE_LABEL_PT = { member: 'Membro', readonly: 'Consulta' } as const;

function inviteUrl(token: string): string {
  return `${window.location.origin}/invite/${token}`;
}

function timeUntil(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'Expirado';
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  if (days >= 1) return `Expira em ${days} dia${days === 1 ? '' : 's'}`;
  const hours = Math.floor(ms / (1000 * 60 * 60));
  if (hours >= 1) return `Expira em ${hours}h`;
  const minutes = Math.max(1, Math.floor(ms / (1000 * 60)));
  return `Expira em ${minutes} min`;
}

interface Props {
  tenantId: string;
}

export function PendingInvitesList({ tenantId }: Props) {
  const qc = useQueryClient();
  const { data: invites = [], isLoading } = useTenantInvites(tenantId);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [pendingRevoke, setPendingRevoke] = useState<string | null>(null);

  const revoke = useMutation({
    mutationFn: async (inviteId: string) => {
      const { error } = await supabase.from('tenant_invites')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', inviteId)
        .eq('tenant_id', tenantId);
      if (error) throw error;
    },
    onMutate: setPendingRevoke,
    onSettled: () => setPendingRevoke(null),
    onSuccess: () => {
      toast.success('Convite revogado');
      qc.invalidateQueries({ queryKey: queryKeys.tenantInvites(tenantId) });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const copy = async (id: string, token: string) => {
    try {
      await navigator.clipboard.writeText(inviteUrl(token));
      setCopiedId(id);
      toast.success('Link copiado');
      setTimeout(() => setCopiedId((curr) => (curr === id ? null : curr)), 2000);
    } catch {
      toast.error('Falha ao copiar');
    }
  };

  if (isLoading) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> A carregar convites…</div>;
  }

  if (invites.length === 0) {
    return <p className="text-sm text-muted-foreground">Sem convites pendentes.</p>;
  }

  const now = Date.now();
  return (
    <div className="space-y-2">
      {invites.map((inv) => {
        const expired = new Date(inv.expires_at).getTime() <= now;
        const isPending = pendingRevoke === inv.id;
        return (
          <div
            key={inv.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed bg-amber-50/30 px-3 py-2.5"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Mail className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                <p className="truncate text-sm font-medium text-gray-900">{inv.email}</p>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {ROLE_LABEL_PT[inv.role]} · {expired ? 'Expirado' : timeUntil(inv.expires_at)}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => copy(inv.id, inv.token)}
                disabled={expired}
                className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {copiedId === inv.id ? <><Check className="h-3.5 w-3.5 text-green-600" /> Copiado</> : <><Copy className="h-3.5 w-3.5" /> Copiar link</>}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Revogar convite para ${inv.email}?`)) revoke.mutate(inv.id);
                }}
                disabled={isPending}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 text-gray-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                aria-label="Revogar convite"
                title="Revogar convite"
              >
                {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
