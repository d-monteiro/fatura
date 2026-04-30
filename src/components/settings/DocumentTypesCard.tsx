import { useMemo } from 'react';
import { useMutation } from '@tanstack/react-query';
import { FileText, Check } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { DOCUMENT_TYPE_LABEL, type DocumentType } from '@/types/database';

const ALL_TYPES: DocumentType[] = ['fatura', 'recibo', 'nota_credito', 'aviso_pagamento', 'outro'];

const TYPE_HINT: Record<DocumentType, string> = {
  fatura: 'Documento de venda/compra principal',
  recibo: 'Prova de pagamento já efectuado',
  nota_credito: 'Correcção a fatura emitida',
  aviso_pagamento: 'Pré-aviso ou instrução de pagamento (não conta como custo)',
  outro: 'Tudo o resto',
};

export function DocumentTypesCard() {
  const { tenant, refreshTenant } = useTenant();
  const allowed = useMemo(
    () => new Set<string>(tenant?.allowed_document_types ?? ['fatura', 'recibo', 'nota_credito']),
    [tenant?.allowed_document_types],
  );

  const save = useMutation({
    mutationFn: async (next: string[]) => {
      if (!tenant?.id) throw new Error('Sem tenant activo');
      // Mantém pelo menos 1 tipo activo — sem isto o Gemini fica sem domínio.
      if (next.length === 0) throw new Error('Tem de haver pelo menos um tipo activo');
      const { error } = await supabase
        .from('tenants')
        .update({ allowed_document_types: next, updated_at: new Date().toISOString() })
        .eq('id', tenant.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      // refreshTenant já refetcha tenant; basta invalidar queries derivadas.
      await refreshTenant?.();
      toast.success('Tipos atualizados');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!tenant) return null;

  const toggle = (type: DocumentType) => {
    const next = new Set(allowed);
    if (next.has(type)) next.delete(type);
    else next.add(type);
    save.mutate(Array.from(next));
  };

  return (
    <div className="border border-border rounded-xl p-6">
      <div className="flex items-start gap-2 mb-4">
        <FileText size={20} className="mt-0.5 text-muted-foreground" />
        <div>
          <h2 className="text-lg font-semibold leading-tight">Tipos de documento</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Quando a IA classifica um documento de tipo não marcado aqui, fica em revisão manual.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {ALL_TYPES.map((type) => {
          const isOn = allowed.has(type);
          return (
            <button
              key={type}
              type="button"
              onClick={() => toggle(type)}
              disabled={save.isPending}
              className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition disabled:opacity-50 ${
                isOn
                  ? 'border-primary/40 bg-primary/5 hover:bg-primary/10'
                  : 'border-border bg-white hover:bg-gray-50'
              }`}
            >
              <span
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                  isOn ? 'border-primary bg-primary text-white' : 'border-input bg-white'
                }`}
              >
                {isOn && <Check className="h-3 w-3" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-gray-900">
                  {DOCUMENT_TYPE_LABEL[type]}
                </span>
                <span className="block text-xs text-muted-foreground">{TYPE_HINT[type]}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
