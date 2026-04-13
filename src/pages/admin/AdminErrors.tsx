import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase/client';
import type { ErrorLog } from '@/types/tickets';

const LEVEL_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  debug: 'outline',
  info: 'secondary',
  warn: 'default',
  error: 'destructive',
  fatal: 'destructive',
};

export default function AdminErrors() {
  const [errors, setErrors] = useState<ErrorLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('error_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data }) => {
        if (data) setErrors(data as ErrorLog[]);
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="text-muted-foreground">Chargement...</div>;

  const unresolved = errors.filter((e) => !e.resolved).length;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Erreurs</h1>
      <p className="text-muted-foreground">{unresolved} erreur(s) non résolue(s)</p>

      <div className="rounded-lg border divide-y">
        {errors.map((err) => (
          <div key={err.id} className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="font-medium text-sm truncate max-w-md">{err.message}</span>
              <Badge variant={LEVEL_VARIANT[err.level] ?? 'outline'}>{err.level}</Badge>
            </div>
            <div className="text-xs text-muted-foreground">
              {err.source} &middot; {err.function_name ?? '—'} &middot; {new Date(err.created_at).toLocaleDateString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        ))}
        {errors.length === 0 && (
          <div className="text-center py-12 text-muted-foreground text-sm">Aucune erreur enregistrée.</div>
        )}
      </div>
    </div>
  );
}
