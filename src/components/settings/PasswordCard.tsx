import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { KeyRound } from 'lucide-react';

export function PasswordCard() {
  const { user } = useAuth();
  const hasPassword = user?.identities?.some((i) => i.provider === 'email') ?? true;

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');

  const mutation = useMutation({
    mutationFn: async () => {
      if (next.length < 8) throw new Error('short');
      if (next !== confirm) throw new Error('mismatch');

      if (hasPassword) {
        const email = user?.email;
        if (!email) throw new Error('no_email');
        const { error: reauthError } = await supabase.auth.signInWithPassword({ email, password: current });
        if (reauthError) throw new Error('wrong_current');
      }

      const { error } = await supabase.auth.updateUser({ password: next });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success(hasPassword ? 'Password alterada' : 'Password definida');
      setCurrent('');
      setNext('');
      setConfirm('');
    },
    onError: (err: Error) => {
      if (err.message === 'short') toast.error('A nova password tem de ter pelo menos 8 caracteres');
      else if (err.message === 'mismatch') toast.error('As passwords não coincidem');
      else if (err.message === 'wrong_current') toast.error('Password atual incorreta');
      else toast.error(hasPassword ? 'Erro ao alterar password' : 'Erro ao definir password');
    },
  });

  const canSubmit =
    next.length >= 8 &&
    next === confirm &&
    (!hasPassword || current.length > 0) &&
    !mutation.isPending;

  const title = hasPassword ? 'Alterar password' : 'Definir password';
  const cta = hasPassword ? 'Alterar password' : 'Definir password';
  const ctaPending = hasPassword ? 'A alterar...' : 'A definir...';

  return (
    <div className="rounded-xl border bg-card p-4 sm:p-6 space-y-4">
      <div className="flex items-center gap-2">
        <KeyRound className="h-5 w-5 text-muted-foreground" />
        <h2 className="font-semibold">{title}</h2>
      </div>

      {!hasPassword && (
        <p className="text-sm text-muted-foreground">
          A tua conta foi criada com Google. Define uma password para também poderes entrar com email.
        </p>
      )}

      <form
        className="space-y-3 max-w-md"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
      >
        {hasPassword && (
          <div className="space-y-1">
            <Label htmlFor="pw-current">Password atual</Label>
            <Input
              id="pw-current"
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
            />
          </div>
        )}
        <div className="space-y-1">
          <Label htmlFor="pw-new">Nova password</Label>
          <Input
            id="pw-new"
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
          />
          <p className="text-xs text-muted-foreground">Mínimo 8 caracteres.</p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="pw-confirm">Confirmar nova password</Label>
          <Input
            id="pw-confirm"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
          />
        </div>

        <Button type="submit" disabled={!canSubmit}>
          {mutation.isPending ? ctaPending : cta}
        </Button>
      </form>
    </div>
  );
}
