import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { UserPlus, Copy, Check, Loader2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { inviteMember, type InviteMemberResult } from '@/lib/api/inviteMember';
import { queryKeys } from '@/lib/queryKeys';

const ROLE_DESC = {
  member: 'Pode adicionar e editar faturas, sincronizar emails, gerir fornecedores e categorias.',
  readonly: 'Só consulta — vê tudo mas não edita. Ideal para o contabilista.',
} as const;

interface Props {
  tenantId: string;
  disabled?: boolean;
}

export function InviteMemberDialog({ tenantId, disabled }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'member' | 'readonly'>('member');
  const [result, setResult] = useState<InviteMemberResult | null>(null);
  const [copied, setCopied] = useState(false);

  const reset = () => {
    setEmail('');
    setRole('member');
    setResult(null);
    setCopied(false);
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) reset();
  };

  const create = useMutation({
    mutationFn: () => inviteMember({ tenantId, email: email.trim(), role }),
    onSuccess: (res) => {
      setResult(res);
      toast.success(`Convite criado para ${res.email}`);
      qc.invalidateQueries({ queryKey: queryKeys.tenantInvites(tenantId) });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const copy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.invite_url);
      setCopied(true);
      toast.success('Link copiado');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Falha ao copiar');
    }
  };

  const canSubmit = email.trim().length > 3 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && !create.isPending;

  return (
    <>
      <Button
        type="button"
        size="sm"
        onClick={() => handleOpenChange(true)}
        disabled={disabled}
        className="gap-1.5"
      >
        <UserPlus className="h-4 w-4" />
        Convidar
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{result ? 'Convite criado' : 'Convidar membro'}</DialogTitle>
            <DialogDescription>
              {result
                ? 'Copia o link e envia ao destinatário. O email automático fica para a próxima fase.'
                : 'O convite expira em 7 dias. O membro pode aceitar com email/password, ou Google.'}
            </DialogDescription>
          </DialogHeader>

          {!result ? (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (canSubmit) create.mutate();
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="invite-email">Email</Label>
                <Input
                  id="invite-email"
                  type="email"
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="contabilista@exemplo.pt"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Permissão</Label>
                <Select value={role} onValueChange={(v) => setRole(v as 'member' | 'readonly')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">Membro</SelectItem>
                    <SelectItem value="readonly">Consulta (só leitura)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{ROLE_DESC[role]}</p>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={!canSubmit}>
                  {create.isPending ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> A criar…</> : 'Gerar convite'}
                </Button>
              </DialogFooter>
            </form>
          ) : (
            <div className="space-y-3">
              <div className="rounded-lg border bg-gray-50 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Link do convite</p>
                <p className="mt-1 break-all font-mono text-xs text-gray-800">{result.invite_url}</p>
              </div>
              <Button onClick={copy} className="w-full gap-1.5">
                {copied ? <><Check className="h-4 w-4" /> Copiado</> : <><Copy className="h-4 w-4" /> Copiar link</>}
              </Button>
              <DialogFooter>
                <Button variant="outline" onClick={() => handleOpenChange(false)}>Fechar</Button>
                <Button onClick={reset}>Convidar outro</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
