import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ShieldCheck, Eye, User, Trash2, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useTenantMembers } from '@/hooks/useTenantMembers';
import { queryKeys } from '@/lib/queryKeys';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import type { TenantRole } from '@/types/tenant';

const ROLE_LABEL: Record<TenantRole, string> = {
  owner: 'Dono',
  member: 'Membro',
  readonly: 'Consulta',
};

const ROLE_COLOR: Record<TenantRole, string> = {
  owner: 'bg-amber-100 text-amber-800 border-amber-200',
  member: 'bg-blue-100 text-blue-800 border-blue-200',
  readonly: 'bg-slate-100 text-slate-700 border-slate-200',
};

function RoleIcon({ role }: { role: TenantRole }) {
  if (role === 'owner') return <ShieldCheck className="h-3.5 w-3.5" />;
  if (role === 'readonly') return <Eye className="h-3.5 w-3.5" />;
  return <User className="h-3.5 w-3.5" />;
}

interface Props {
  tenantId: string;
  currentUserId: string;
}

export function MembersList({ tenantId, currentUserId }: Props) {
  const qc = useQueryClient();
  const { data: members = [], isLoading } = useTenantMembers(tenantId);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const updateRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: 'member' | 'readonly' }) => {
      const { error } = await supabase.from('tenant_users')
        .update({ role })
        .eq('tenant_id', tenantId)
        .eq('user_id', userId);
      if (error) throw error;
    },
    onMutate: ({ userId }) => setPendingId(userId),
    onSettled: () => setPendingId(null),
    onSuccess: () => {
      toast.success('Permissão actualizada');
      qc.invalidateQueries({ queryKey: queryKeys.tenantMembers(tenantId) });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMember = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.from('tenant_users')
        .delete()
        .eq('tenant_id', tenantId)
        .eq('user_id', userId);
      if (error) throw error;
    },
    onMutate: setPendingId,
    onSettled: () => setPendingId(null),
    onSuccess: () => {
      toast.success('Membro removido');
      qc.invalidateQueries({ queryKey: queryKeys.tenantMembers(tenantId) });
    },
    onError: (e: Error) => {
      // Trigger prevent_orphan_tenant atira check_violation (23514)
      const msg = e.message.includes('Cannot remove last owner')
        ? 'Não podes remover o último dono.'
        : e.message;
      toast.error(msg);
    },
  });

  if (isLoading) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> A carregar membros…</div>;
  }

  if (members.length === 0) {
    return <p className="text-sm text-muted-foreground">Sem membros (impossível em produção, deve haver pelo menos 1 dono).</p>;
  }

  return (
    <div className="space-y-2">
      {members.map((m) => {
        const isSelf = m.user_id === currentUserId;
        const isOwner = m.role === 'owner';
        const isPending = pendingId === m.user_id;
        return (
          <div
            key={m.user_id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-white px-3 py-2.5"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-medium text-gray-900">{m.email}</p>
                {isSelf && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-600">Tu</span>}
              </div>
              {!m.is_active && (
                <p className="mt-0.5 text-xs text-amber-600">Inactivo</p>
              )}
            </div>

            <div className="flex items-center gap-2">
              {isOwner ? (
                <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${ROLE_COLOR.owner}`}>
                  <RoleIcon role="owner" /> {ROLE_LABEL.owner}
                </span>
              ) : (
                <Select
                  value={m.role}
                  onValueChange={(v) => updateRole.mutate({ userId: m.user_id, role: v as 'member' | 'readonly' })}
                  disabled={isPending}
                >
                  <SelectTrigger className="h-8 w-[130px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">{ROLE_LABEL.member}</SelectItem>
                    <SelectItem value="readonly">{ROLE_LABEL.readonly}</SelectItem>
                  </SelectContent>
                </Select>
              )}

              {!isOwner && !isSelf && (
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`Remover ${m.email} deste tenant?`)) removeMember.mutate(m.user_id);
                  }}
                  disabled={isPending}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 text-gray-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                  aria-label="Remover membro"
                  title="Remover membro"
                >
                  {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
