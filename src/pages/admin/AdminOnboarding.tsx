import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase/client';
import { OnboardingDetailDrawer } from '@/components/admin/OnboardingDetailDrawer';
import type { OnboardingSubmission } from '@/types/tenant';
import { ChevronRight } from 'lucide-react';

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  draft: 'outline', submitted: 'default', processing: 'secondary', completed: 'secondary', failed: 'destructive',
};

export default function AdminOnboarding() {
  const [selected, setSelected] = useState<OnboardingSubmission | null>(null);

  const { data: submissions = [], isLoading } = useQuery<OnboardingSubmission[]>({
    queryKey: ['admin-onboarding'],
    queryFn: async () => {
      const { data, error } = await supabase.from('onboarding_submissions').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as OnboardingSubmission[];
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Onboarding</h1>
        <p className="text-sm text-muted-foreground">{submissions.length} submissão(ões)</p>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">A carregar...</div>
      ) : submissions.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Nenhuma submissão.</div>
      ) : (
        <div className="rounded-lg border divide-y">
          {submissions.map((sub) => (
            <button
              key={sub.id}
              onClick={() => setSelected(sub)}
              className="w-full p-4 text-left hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center justify-between gap-3 mb-1">
                <span className="font-medium text-sm truncate">{sub.email}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={STATUS_VARIANT[sub.status] ?? 'outline'}>{sub.status}</Badge>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                Passo {sub.current_step}/7 · Plano: {sub.selected_plan ?? '—'} · {new Date(sub.created_at).toLocaleDateString('pt-PT')}
              </div>
            </button>
          ))}
        </div>
      )}

      <OnboardingDetailDrawer submission={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
