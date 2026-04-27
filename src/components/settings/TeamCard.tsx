import { Users, Sparkles } from 'lucide-react';
import { useTenant } from '@/contexts/TenantContext';
import { useAuth } from '@/contexts/AuthContext';
import { MembersList } from './MembersList';
import { PendingInvitesList } from './PendingInvitesList';
import { InviteMemberDialog } from './InviteMemberDialog';

export function TeamCard() {
  const { tenant, plan, role } = useTenant();
  const { user } = useAuth();

  if (!tenant || !user || role !== 'owner') return null;

  const canInvite = !!plan?.has_multi_user;

  return (
    <div className="rounded-xl border bg-card p-4 sm:p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-muted-foreground" />
          <div>
            <h2 className="font-semibold">Equipa</h2>
            <p className="text-xs text-muted-foreground">
              Convida membros da tua equipa ou o teu contabilista.
            </p>
          </div>
        </div>
        <InviteMemberDialog tenantId={tenant.id} disabled={!canInvite} />
      </div>

      {!canInvite && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm">
          <Sparkles className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
          <div>
            <p className="font-medium text-amber-900">Faz upgrade para convidar mais utilizadores</p>
            <p className="text-xs text-amber-800/80 mt-0.5">
              O plano actual permite só 1 utilizador. O plano Pro adiciona 2 lugares e o Empresarial é ilimitado.
            </p>
          </div>
        </div>
      )}

      <div className="space-y-3">
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Membros</h3>
          <MembersList tenantId={tenant.id} currentUserId={user.id} />
        </div>

        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Convites pendentes</h3>
          <PendingInvitesList tenantId={tenant.id} />
        </div>
      </div>
    </div>
  );
}
