import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { UserPlus, Trash2 } from 'lucide-react';

interface AdminRow { user_id: string; email: string; note: string | null; created_at: string; }
type Mode = 'link_existing' | 'invite' | 'create';

const ERROR_MESSAGES: Record<string, string> = {
  invalid_email: 'Email inválido',
  password_too_short: 'A password tem de ter pelo menos 8 caracteres',
  user_already_exists: 'Já existe um utilizador com esse email — usa "Ligar existente"',
  already_admin: 'Esse utilizador já é administrador',
  invite_failed: 'Não foi possível enviar o convite',
  create_failed: 'Não foi possível criar o utilizador',
  user_not_found: 'Não existe utilizador com esse email',
  not_authorized: 'Sem permissões',
};

export default function AdminAdmins() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('link_existing');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [note, setNote] = useState('');

  const { data: admins = [], isLoading } = useQuery<AdminRow[]>({
    queryKey: ['admin-admins'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_admins');
      if (error) throw error;
      return (data ?? []) as AdminRow[];
    },
  });

  const resetForm = () => {
    setOpen(false);
    setMode('link_existing');
    setEmail('');
    setPassword('');
    setNote('');
  };

  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin-admins'] });

  const linkMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('add_admin_by_email', {
        target_email: email.trim(),
        admin_note: note.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Administrador ligado'); resetForm(); invalidate(); },
    onError: (err: Error) => {
      const key = Object.keys(ERROR_MESSAGES).find((k) => err.message.includes(k));
      toast.error(key ? ERROR_MESSAGES[key] : 'Erro ao ligar administrador');
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('admin-create-user', {
        body: {
          email: email.trim(),
          password: mode === 'create' ? password : undefined,
          note: note.trim() || null,
          send_invite: mode === 'invite',
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      toast.success(mode === 'invite' ? 'Convite enviado por email' : 'Administrador criado');
      resetForm();
      invalidate();
    },
    onError: (err: Error) => {
      const key = Object.keys(ERROR_MESSAGES).find((k) => err.message.includes(k));
      toast.error(key ? ERROR_MESSAGES[key] : 'Erro ao criar administrador');
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.from('admin_users').delete().eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Administrador removido'); invalidate(); },
    onError: () => toast.error('Erro ao remover administrador'),
  });

  const submit = () => {
    if (!email.trim()) return;
    if (mode === 'link_existing') linkMutation.mutate();
    else createMutation.mutate();
  };

  const isPending = linkMutation.isPending || createMutation.isPending;
  const canSubmit = email.trim().length > 0 && !isPending && (mode !== 'create' || password.length >= 8);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Administradores</h1>
          <p className="text-sm text-muted-foreground">{admins.length} administrador(es) global(is)</p>
        </div>
        <Button onClick={() => setOpen(true)} className="gap-2">
          <UserPlus className="h-4 w-4" /> Adicionar
        </Button>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">A carregar...</div>
      ) : admins.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Sem administradores.</div>
      ) : (
        <div className="rounded-lg border divide-y">
          {admins.map((a) => {
            const isSelf = a.user_id === user?.id;
            return (
              <div key={a.user_id} className="p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">{a.email}{isSelf && <span className="text-xs text-muted-foreground"> (tu)</span>}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {a.note ?? '—'} · desde {new Date(a.created_at).toLocaleDateString('pt-PT')}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={isSelf || removeMutation.isPending}
                  onClick={() => {
                    if (confirm(`Remover ${a.email} como administrador?`)) removeMutation.mutate(a.user_id);
                  }}
                  title={isSelf ? 'Não podes remover-te a ti próprio' : 'Remover'}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <Sheet open={open} onOpenChange={(o) => (o ? setOpen(true) : resetForm())}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Adicionar administrador</SheetTitle>
          </SheetHeader>

          <div className="space-y-5 mt-6">
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1 text-xs">
              <button type="button" onClick={() => setMode('link_existing')} className={`rounded-md py-2 ${mode === 'link_existing' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}>Ligar existente</button>
              <button type="button" onClick={() => setMode('invite')} className={`rounded-md py-2 ${mode === 'invite' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}>Convidar</button>
              <button type="button" onClick={() => setMode('create')} className={`rounded-md py-2 ${mode === 'create' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}>Criar com password</button>
            </div>

            <p className="text-xs text-muted-foreground">
              {mode === 'link_existing' && 'O utilizador já tem conta — promove a administrador.'}
              {mode === 'invite' && 'Envia email de convite. Define a password ao aceitar.'}
              {mode === 'create' && 'Cria a conta com email + password (sem confirmação). Útil para uso interno.'}
            </p>

            <div className="space-y-2">
              <Label htmlFor="admin-email">Email</Label>
              <Input id="admin-email" type="email" placeholder="email@exemplo.pt" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>

            {mode === 'create' && (
              <div className="space-y-2">
                <Label htmlFor="admin-password">Password</Label>
                <Input id="admin-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
                <p className="text-xs text-muted-foreground">Mínimo 8 caracteres.</p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="admin-note">Nota (opcional)</Label>
              <Textarea id="admin-note" placeholder="Ex: dev principal, suporte..." value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
            </div>

            <Button className="w-full" onClick={submit} disabled={!canSubmit}>
              {isPending ? 'A processar...' : mode === 'link_existing' ? 'Ligar' : mode === 'invite' ? 'Enviar convite' : 'Criar administrador'}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
