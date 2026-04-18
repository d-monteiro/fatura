import { useQueryClient } from '@tanstack/react-query';
import { useTenant } from '@/contexts/TenantContext';
import { toast } from 'sonner';
import { Building2, Check, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/cn';

export function TenantSwitcher() {
  const { tenant, tenants, switchTenant } = useTenant();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  if (tenants.length <= 1) return null;

  const handleSwitch = async (id: string) => {
    if (id === tenant?.id) { setOpen(false); return; }
    try {
      await switchTenant(id);
      qc.clear();
      setOpen(false);
      toast.success('Organização alterada');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao trocar organização');
    }
  };

  return (
    <div className="relative px-3 pt-3">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="flex w-full items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-left text-sm hover:bg-white/15"
      >
        <Building2 size={16} className="shrink-0 text-white/70" />
        <span className="flex-1 truncate text-white">{tenant?.name ?? 'Organização'}</span>
        <ChevronDown size={14} className={cn('shrink-0 text-white/50 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute inset-x-3 z-50 mt-1 rounded-lg bg-white py-1 shadow-lg">
          {tenants.map((tOpt) => (
            <button
              key={tOpt.id}
              type="button"
              onClick={() => { void handleSwitch(tOpt.id); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-800 hover:bg-gray-50"
            >
              <span className="flex-1 truncate">{tOpt.name}</span>
              {tOpt.id === tenant?.id && <Check size={14} className="text-primary" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
