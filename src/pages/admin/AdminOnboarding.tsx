import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase/client';
import type { OnboardingSubmission } from '@/types/tenant';

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  draft: 'outline',
  submitted: 'default',
  processing: 'secondary',
  completed: 'secondary',
  failed: 'destructive',
};

export default function AdminOnboarding() {
  const [submissions, setSubmissions] = useState<OnboardingSubmission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('onboarding_submissions')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) setSubmissions(data as OnboardingSubmission[]);
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="text-muted-foreground">A carregar...</div>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Onboarding</h1>
      <p className="text-muted-foreground">{submissions.length} soumission(s)</p>

      <div className="rounded-lg border divide-y">
        {submissions.map((sub) => (
          <div key={sub.id} className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="font-medium text-sm">{sub.email}</span>
              <Badge variant={STATUS_VARIANT[sub.status] ?? 'outline'}>{sub.status}</Badge>
            </div>
            <div className="text-xs text-muted-foreground">
              Passo {sub.current_step}/7 &middot; Plan: {sub.selected_plan ?? '—'} &middot; {new Date(sub.created_at).toLocaleDateString('pt-PT')}
            </div>
          </div>
        ))}
        {submissions.length === 0 && (
          <div className="text-center py-12 text-muted-foreground text-sm">Nenhuma submissão.</div>
        )}
      </div>
    </div>
  );
}
