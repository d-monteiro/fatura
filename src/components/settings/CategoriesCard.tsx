import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { Tags, Plus, Check, X, RefreshCw, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { CATEGORY_TEMPLATES, SECTORS } from '@/components/onboarding/onboardingTypes';
import { queryKeys } from '@/lib/queryKeys';
import type { Category } from '@/types/database';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

function slugify(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'cat';
}

export function CategoriesCard() {
  const { tenant } = useTenant();
  const qc = useQueryClient();

  const { data: everCount, isLoading: countLoading } = useQuery({
    queryKey: [...queryKeys.categoriesByTenant(tenant?.id ?? null), 'ever'],
    enabled: !!tenant?.id,
    queryFn: async () => {
      const { count } = await supabase.from('categories')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenant!.id);
      return count ?? 0;
    },
  });

  const seedStandard = useMutation({
    mutationFn: async () => {
      if (!tenant?.id) throw new Error('Sem tenant activo');
      const sectorKey = tenant.sector && tenant.sector !== 'outro' ? tenant.sector : 'services';
      const tpl = CATEGORY_TEMPLATES[sectorKey] ?? CATEGORY_TEMPLATES.services ?? [];
      if (!tpl.length) throw new Error('Template em falta');

      const rows = tpl.map((c, i) => ({
        tenant_id: tenant.id,
        axis: 'category' as const,
        code: slugify(c.label),
        label: c.label,
        sort_order: i,
        is_active: true,
        is_fixed: !!c.is_fixed,
      }));

      const { error } = await supabase.from('categories').upsert(rows, { onConflict: 'tenant_id,axis,code', ignoreDuplicates: false });
      if (error) throw error;
      return rows.length;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.categories });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const autoSeeded = useRef(false);
  useEffect(() => {
    if (autoSeeded.current) return;
    if (countLoading || !tenant?.id || !tenant.sector) return;
    if (everCount !== 0) return;
    autoSeeded.current = true;
    seedStandard.mutate();
  }, [countLoading, everCount, tenant?.id, tenant?.sector, seedStandard]);

  const [confirmOpen, setConfirmOpen] = useState(false);

  if (!tenant) return null;

  const sectorLabel = SECTORS.find((s) => s.value === tenant.sector)?.label;
  const canApplyTemplate = !!tenant.sector && tenant.sector !== 'outro' && !!sectorLabel;

  return (
    <div className="border border-border rounded-xl p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div className="flex items-start gap-2">
          <Tags size={20} className="mt-0.5 text-muted-foreground" />
          <div>
            <h2 className="text-lg font-semibold leading-tight">Categorias</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Classificação única das tuas despesas. O cadeado marca categorias com comportamento de custo fixo.
            </p>
          </div>
        </div>
        {canApplyTemplate && (
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={seedStandard.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            title={`Repõe as categorias do template ${sectorLabel}`}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${seedStandard.isPending ? 'animate-spin' : ''}`} />
            {seedStandard.isPending ? 'A aplicar…' : `Repor template ${sectorLabel}`}
          </button>
        )}
      </div>

      <CategoriesEditor tenantId={tenant.id} />

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aplicar template de {sectorLabel}?</AlertDialogTitle>
            <AlertDialogDescription>
              Adiciona ou repõe as categorias-base deste setor. Categorias que adicionaste manualmente são mantidas; categorias do template que tenhas removido voltam a aparecer e os nomes voltam aos originais.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmOpen(false);
                seedStandard.mutate(undefined, { onSuccess: () => toast.success('Template aplicado') });
              }}
            >
              Aplicar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CategoriesEditor({ tenantId }: { tenantId: string }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<{ id: string; label: string } | null>(null);

  const queryKey = ['categories', tenantId, 'category'];

  const { data: rows = [] } = useQuery<Category[]>({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase.from('categories')
        .select('*').eq('tenant_id', tenantId).eq('axis', 'category').eq('is_active', true)
        .order('sort_order').order('label');
      if (error) throw error;
      return (data ?? []) as Category[];
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey });

  const add = useMutation({
    mutationFn: async (newLabel: string) => {
      const trimmed = newLabel.trim();
      if (!trimmed) throw new Error('Nome vazio');
      if (rows.some((r) => r.label.toLowerCase() === trimmed.toLowerCase())) throw new Error('Já existe');
      const code = slugify(trimmed);
      const sort = rows.length;
      const { error } = await supabase.from('categories').insert({
        tenant_id: tenantId, axis: 'category', code, label: trimmed,
        sort_order: sort, is_active: true, is_fixed: false,
      });
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); setDraft(''); },
    onError: (e: Error) => toast.error(e.message),
  });

  const rename = useMutation({
    mutationFn: async ({ id, newLabel }: { id: string; newLabel: string }) => {
      const trimmed = newLabel.trim();
      if (!trimmed) throw new Error('Nome vazio');
      const { error } = await supabase.from('categories').update({ label: trimmed }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); setEditing(null); },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleFixed = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: boolean }) => {
      const { error } = await supabase.from('categories').update({ is_fixed: value }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
  });

  const remove = useMutation({
    mutationFn: async (row: { id: string; label: string }) => {
      const { error } = await supabase.from('categories').update({ is_active: false }).eq('id', row.id);
      if (error) throw error;
      return row;
    },
    onSuccess: ({ id, label: removedLabel }) => {
      invalidate();
      toast.success(`"${removedLabel}" removido`, {
        action: {
          label: 'Anular',
          onClick: () => {
            void supabase.from('categories').update({ is_active: true }).eq('id', id)
              .then(({ error }) => {
                if (error) toast.error('Não foi possível repor');
                else invalidate();
              });
          },
        },
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {rows.map((r) => editing?.id === r.id ? (
          <span key={r.id} className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-white pl-3 pr-1 py-1">
            <input
              autoFocus
              className="bg-transparent text-xs outline-none w-32"
              value={editing.label}
              onChange={(e) => setEditing({ id: r.id, label: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') rename.mutate({ id: r.id, newLabel: editing.label });
                if (e.key === 'Escape') setEditing(null);
              }}
            />
            <button type="button" onClick={() => rename.mutate({ id: r.id, newLabel: editing.label })}
              className="rounded-full p-0.5 text-green-600 hover:bg-green-50" title="Guardar">
              <Check className="h-3 w-3" />
            </button>
            <button type="button" onClick={() => setEditing(null)}
              className="rounded-full p-0.5 text-gray-400 hover:bg-gray-100" title="Cancelar">
              <X className="h-3 w-3" />
            </button>
          </span>
        ) : (
          <span key={r.id}
            className={`inline-flex items-center rounded-full pl-3 pr-1 py-1 text-xs transition ${
              r.is_fixed ? 'bg-violet-100 text-violet-800 hover:bg-violet-200' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}>
            <button type="button" onClick={() => toggleFixed.mutate({ id: r.id, value: !r.is_fixed })}
              className="mr-1 rounded-full p-0.5 hover:bg-white/50"
              title={r.is_fixed ? 'É custo fixo (clica para variável)' : 'É custo variável (clica para fixo)'}>
              <Lock className={`h-3 w-3 ${r.is_fixed ? 'text-violet-700' : 'text-gray-400'}`} />
            </button>
            <button type="button" onClick={() => setEditing({ id: r.id, label: r.label })}
              className="font-medium hover:opacity-80" title="Editar">
              {r.label}
            </button>
            <button type="button" onClick={() => remove.mutate({ id: r.id, label: r.label })}
              className="ml-1 rounded-full p-0.5 text-gray-400 hover:bg-white hover:text-red-600 transition" title="Remover">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {rows.length === 0 && (
          <span className="text-xs text-muted-foreground italic">
            Sem categorias. Adiciona abaixo ou repõe o template.
          </span>
        )}
      </div>

      <div className="flex gap-2">
        <Input
          className="flex-1"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && draft.trim()) { e.preventDefault(); add.mutate(draft); } }}
          placeholder="Adicionar categoria…"
        />
        <button type="button" onClick={() => add.mutate(draft)}
          disabled={!draft.trim() || add.isPending}
          className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 shrink-0">
          <Plus className="h-3.5 w-3.5" /> Adicionar
        </button>
      </div>
    </div>
  );
}
