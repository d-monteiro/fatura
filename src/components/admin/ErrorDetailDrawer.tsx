import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { ErrorLog } from '@/types/tickets';
import { Check, RotateCcw } from 'lucide-react';

interface Props { error: ErrorLog | null; onClose: () => void; }

export function ErrorDetailDrawer({ error, onClose }: Props) {
  const qc = useQueryClient();
  const { user } = useAuth();

  const mutation = useMutation({
    mutationFn: async (patch: Partial<ErrorLog>) => {
      if (!error) return;
      const { error: err } = await supabase.from('error_logs').update(patch).eq('id', error.id);
      if (err) throw err;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-errors'] });
      onClose();
    },
    onError: () => toast.error('Erro ao atualizar'),
  });

  if (!error) return null;

  return (
    <Sheet open={!!error} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="break-words pr-8">{error.message}</SheetTitle>
          <div className="flex items-center gap-2 pt-1 flex-wrap">
            <Badge variant={error.level === 'error' || error.level === 'fatal' ? 'destructive' : 'secondary'}>{error.level}</Badge>
            <Badge variant="outline">{error.source}</Badge>
            {error.resolved && <Badge variant="default">Resolvido</Badge>}
          </div>
        </SheetHeader>

        <div className="space-y-4 mt-6 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div><div className="text-xs text-muted-foreground">Função</div><div className="truncate">{error.function_name ?? '—'}</div></div>
            <div><div className="text-xs text-muted-foreground">Quando</div><div>{new Date(error.created_at).toLocaleString('pt-PT')}</div></div>
            {error.http_method && (
              <div className="col-span-2">
                <div className="text-xs text-muted-foreground">HTTP</div>
                <div className="font-mono text-xs">{error.http_method} {error.http_path} → {error.http_status}</div>
              </div>
            )}
          </div>

          {error.stack_trace && (
            <details className="rounded-md border p-3">
              <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">Stack trace</summary>
              <pre className="mt-2 text-xs whitespace-pre-wrap break-words font-mono">{error.stack_trace}</pre>
            </details>
          )}

          {error.metadata && Object.keys(error.metadata).length > 0 && (
            <details className="rounded-md border p-3">
              <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">Metadata</summary>
              <pre className="mt-2 text-xs whitespace-pre-wrap break-words font-mono">{JSON.stringify(error.metadata, null, 2)}</pre>
            </details>
          )}

          <div className="pt-2 border-t">
            {error.resolved ? (
              <Button
                variant="outline"
                className="w-full gap-2"
                disabled={mutation.isPending}
                onClick={() => mutation.mutate({ resolved: false, resolved_at: null, resolved_by: null })}
              >
                <RotateCcw className="h-4 w-4" /> Reabrir
              </Button>
            ) : (
              <Button
                className="w-full gap-2"
                disabled={mutation.isPending}
                onClick={() => mutation.mutate({ resolved: true, resolved_at: new Date().toISOString(), resolved_by: user?.id ?? null })}
              >
                <Check className="h-4 w-4" /> Marcar como resolvido
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
