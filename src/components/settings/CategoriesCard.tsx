import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { Tags, Plus, Trash2, Check, X, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { CATEGORY_TEMPLATES, SECTORS } from '@/components/onboarding/onboardingTypes';
import type { Category, CategoryAxis } from '@/types/database';
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

const AXES: { value: Exclude<CategoryAxis, 'cost_type'>; label: string; hint: string }[] = [
  { value: 'metier', label: 'Especialidades', hint: 'Áreas técnicas do seu negócio (ex: Eletricidade, Canalização)' },
  { value: 'nature_depense', label: 'Naturezas de despesa', hint: 'Tipos de compra (ex: Materiais, Combustível, Software)' },
];

function slugify(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'cat';
}

export function CategoriesCard() {
  const { tenant } = useTenant();
  const qc = useQueryClient();

  const { data: everCount, isLoading: countLoading } = useQuery({
    queryKey: ['categories', tenant?.id, 'ever'],
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
      const sectorKey = tenant.sector && tenant.sector !== 'autre' ? tenant.sector : 'services';
      const tpl = CATEGORY_TEMPLATES[sectorKey] ?? CATEGORY_TEMPLATES.services;
      if (!tpl) throw new Error('Template em falta');

      const rows: { tenant_id: string; axis: CategoryAxis; code: string; label: string; sort_order: number; is_active: true }[] = [];
      tpl.cost_types.forEach((label, i) => rows.push({
        tenant_id: tenant.id, axis: 'cost_type',
        code: label.toLowerCase().includes('fix') ? 'cout_fixe' : label.toLowerCase().includes('var') ? 'cout_variable' : slugify(label),
        label, sort_order: i, is_active: true,
      }));
      tpl.metiers.forEach((label, i) => rows.push({
        tenant_id: tenant.id, axis: 'metier', code: slugify(label), label, sort_order: i, is_active: true,
      }));
      tpl.natures.forEach((label, i) => rows.push({
        tenant_id: tenant.id, axis: 'nature_depense', code: slugify(label), label, sort_order: i, is_active: true,
      }));

      if (!rows.length) throw new Error('Nada para carregar');
      const { error } = await supabase.from('categories').upsert(rows, { onConflict: 'tenant_id,axis,code', ignoreDuplicates: false });
      if (error) throw error;
      return rows.length;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Auto-seed: tenant antigo (ou setor mudado) sem nenhuma categoria — carrega o template do setor uma vez.
  // Não re-seed se user removeu tudo manualmente (everCount > 0 mantém-se via soft-delete).
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
  const canApplyTemplate = !!tenant.sector && tenant.sector !== 'autre' && !!sectorLabel;

  return (
    <div className="border border-border rounded-xl p-6 space-y-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Tags size={20} />
          <h2 className="text-lg font-semibold">Categorias</h2>
        </div>
        {canApplyTemplate && (
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={seedStandard.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            title={`Repõe as categorias do template ${sectorLabel}`}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${seedStandard.isPending ? 'animate-spin' : ''}`} />
            {seedStandard.isPending ? 'A aplicar…' : 'Aplicar template do setor'}
          </button>
        )}
      </div>
      {AXES.map((a) => (
        <AxisSection key={a.value} tenantId={tenant.id} axis={a.value} label={a.label} hint={a.hint} />
      ))}

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

function AxisSection({ tenantId, axis, label, hint }: { tenantId: string; axis: CategoryAxis; label: string; hint: string }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<{ id: string; label: string } | null>(null);

  const queryKey = ['categories', tenantId, axis];

  const { data: rows = [] } = useQuery<Category[]>({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase.from('categories')
        .select('*').eq('tenant_id', tenantId).eq('axis', axis).eq('is_active', true)
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
        tenant_id: tenantId, axis, code, label: trimmed, sort_order: sort, is_active: true,
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

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('categories').update({ is_active: false }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-2">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">{label}</h3>
        <p className="text-xs text-gray-500">{hint}</p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {rows.map((r) => editing?.id === r.id ? (
          <span key={r.id} className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-white px-2 py-0.5">
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
            <button onClick={() => rename.mutate({ id: r.id, newLabel: editing.label })} className="text-green-600 hover:text-green-700"><Check className="h-3 w-3" /></button>
            <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-600"><X className="h-3 w-3" /></button>
          </span>
        ) : (
          <span key={r.id} className="group inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-700">
            <button onClick={() => setEditing({ id: r.id, label: r.label })} className="hover:text-primary">{r.label}</button>
            <button
              onClick={() => { if (confirm(`Remover "${r.label}"?`)) remove.mutate(r.id); }}
              className="text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </span>
        ))}
        {rows.length === 0 && <span className="text-xs text-gray-400">Nenhuma ainda.</span>}
      </div>

      <div className="flex gap-2">
        <Input
          className="flex-1"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && draft.trim()) { e.preventDefault(); add.mutate(draft); } }}
          placeholder={`Adicionar ${label.toLowerCase().slice(0, -1)}…`}
        />
        <button
          type="button"
          onClick={() => add.mutate(draft)}
          disabled={!draft.trim() || add.isPending}
          className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 shrink-0"
        >
          <Plus className="h-3.5 w-3.5" /> Adicionar
        </button>
      </div>
    </div>
  );
}
