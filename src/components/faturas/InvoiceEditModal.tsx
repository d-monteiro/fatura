import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useI18n } from '@/contexts/I18nContext';
import type { Invoice, Metier, NatureDepense, CostType, InvoiceStatus } from '@/types/database';

interface Props { invoice: Invoice; open: boolean; onClose: () => void; }

const METIERS: Metier[] = ['electricite', 'plomberie', 'chauffage', 'platrerie', 'autre'];
const NATURES: NatureDepense[] = ['materiaux', 'sous_traitants', 'location_materiel', 'restauration', 'carburant', 'atelier', 'assurances', 'comptabilite', 'fournitures_bureau', 'autre'];
const COST_TYPES: CostType[] = ['cout_fixe', 'cout_variable'];
const STATUSES: InvoiceStatus[] = ['pending', 'inbox', 'processed', 'review'];
const cls = 'w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';
const n = (v: number | null): string => (v != null ? String(v) : '');

export function InvoiceEditModal({ invoice, open, onClose }: Props) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    supplier_name: invoice.supplier_name ?? '', doc_date: invoice.doc_date ?? '',
    doc_number: invoice.doc_number ?? '', montant_ht: n(invoice.montant_ht),
    montant_tva: n(invoice.montant_tva), montant_ttc: n(invoice.montant_ttc),
    taux_tva: n(invoice.taux_tva), metier: invoice.metier ?? '',
    nature_depense: invoice.nature_depense ?? '', cost_type: invoice.cost_type ?? '',
    summary: invoice.summary ?? '', status: invoice.status,
  });
  const set = (key: string, value: string) => setForm((p) => ({ ...p, [key]: value }));

  const mutation = useMutation({
    mutationFn: async () => {
      const pf = (v: string) => (v ? parseFloat(v) : null);
      const updates: Record<string, unknown> = {
        supplier_name: form.supplier_name || null, doc_date: form.doc_date || null,
        doc_number: form.doc_number || null, montant_ht: pf(form.montant_ht),
        montant_tva: pf(form.montant_tva), montant_ttc: pf(form.montant_ttc),
        taux_tva: pf(form.taux_tva), metier: form.metier || null,
        nature_depense: form.nature_depense || null, cost_type: form.cost_type || null,
        summary: form.summary || null, status: form.status,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from('invoices').update(updates).eq('id', invoice.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['faturas'] });
      qc.invalidateQueries({ queryKey: ['inbox-invoices'] });
      qc.invalidateQueries({ queryKey: ['dashboard-metrics'] });
      qc.invalidateQueries({ queryKey: ['recent-invoices'] });
      onClose();
    },
  });

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between border-b px-5 py-4">
            <h2 className="text-lg font-semibold text-gray-900">{t('edit.title')}</h2>
            <button onClick={onClose} className="rounded-lg p-1 hover:bg-gray-100"><X className="h-5 w-5" /></button>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }} className="max-h-[70vh] overflow-y-auto px-5 py-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1"><span className="text-xs font-medium text-gray-600">{t('inv.supplier')}</span>
                <input className={cls} value={form.supplier_name} onChange={(e) => set('supplier_name', e.target.value)} /></label>
              <label className="space-y-1"><span className="text-xs font-medium text-gray-600">{t('inv.date')}</span>
                <input type="date" className={cls} value={form.doc_date} onChange={(e) => set('doc_date', e.target.value)} /></label>
              <label className="space-y-1"><span className="text-xs font-medium text-gray-600">{t('inv.doc_number')}</span>
                <input className={cls} value={form.doc_number} onChange={(e) => set('doc_number', e.target.value)} /></label>
              <label className="space-y-1"><span className="text-xs font-medium text-gray-600">{t('inv.amount_ht')}</span>
                <input type="number" step="0.01" className={cls} value={form.montant_ht} onChange={(e) => set('montant_ht', e.target.value)} /></label>
              <label className="space-y-1"><span className="text-xs font-medium text-gray-600">{t('inv.tva')}</span>
                <input type="number" step="0.01" className={cls} value={form.montant_tva} onChange={(e) => set('montant_tva', e.target.value)} /></label>
              <label className="space-y-1"><span className="text-xs font-medium text-gray-600">{t('inv.amount_ttc')}</span>
                <input type="number" step="0.01" className={cls} value={form.montant_ttc} onChange={(e) => set('montant_ttc', e.target.value)} /></label>
              <label className="space-y-1"><span className="text-xs font-medium text-gray-600">{t('inv.tva_rate')} (%)</span>
                <input type="number" step="0.1" className={cls} value={form.taux_tva} onChange={(e) => set('taux_tva', e.target.value)} /></label>
              <label className="space-y-1"><span className="text-xs font-medium text-gray-600">{t('inv.status')}</span>
                <select className={cls} value={form.status} onChange={(e) => set('status', e.target.value)}>
                  {STATUSES.map((s) => <option key={s} value={s}>{t(`status.${s}` as 'status.pending')}</option>)}
                </select></label>
              <label className="space-y-1"><span className="text-xs font-medium text-gray-600">{t('inv.metier')}</span>
                <select className={cls} value={form.metier} onChange={(e) => set('metier', e.target.value)}>
                  <option value="">--</option>{METIERS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select></label>
              <label className="space-y-1"><span className="text-xs font-medium text-gray-600">{t('inv.nature')}</span>
                <select className={cls} value={form.nature_depense} onChange={(e) => set('nature_depense', e.target.value)}>
                  <option value="">--</option>{NATURES.map((v) => <option key={v} value={v}>{v}</option>)}
                </select></label>
              <label className="col-span-2 space-y-1"><span className="text-xs font-medium text-gray-600">{t('inv.cost_type')}</span>
                <select className={cls} value={form.cost_type} onChange={(e) => set('cost_type', e.target.value)}>
                  <option value="">--</option>{COST_TYPES.map((c) => <option key={c} value={c}>{c === 'cout_fixe' ? 'Fixe' : 'Variable'}</option>)}
                </select></label>
              <label className="col-span-2 space-y-1"><span className="text-xs font-medium text-gray-600">{t('inv.summary')}</span>
                <input className={cls} value={form.summary} onChange={(e) => set('summary', e.target.value)} /></label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={onClose}
                className="rounded-lg border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">{t('action.cancel')}</button>
              <button type="submit" disabled={mutation.isPending}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white shadow-sm hover:opacity-90 transition-all disabled:opacity-60">
                {mutation.isPending ? t('edit.saving') : t('action.save')}</button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
