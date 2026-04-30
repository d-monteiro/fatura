import { Briefcase } from 'lucide-react';
import { useTenant } from '@/contexts/TenantContext';

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-foreground">{value || '—'}</p>
    </div>
  );
}

export function BusinessProfileReadView() {
  const { tenant } = useTenant();
  if (!tenant) return null;

  return (
    <div className="border border-border rounded-xl p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Briefcase size={20} />
        <h2 className="text-lg font-semibold">Perfil do negócio</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Estás numa conta de consulta. Os dados desta empresa são visíveis mas não editáveis.
      </p>
      <div className="flex items-center gap-3">
        {tenant.logo_url ? (
          <img
            src={tenant.logo_url}
            alt=""
            className="h-12 w-12 rounded-lg bg-white object-contain p-1 border"
          />
        ) : null}
        <div>
          <p className="text-base font-semibold">{tenant.name}</p>
          {tenant.sector && <p className="text-xs text-muted-foreground">{tenant.sector}</p>}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="NIF" value={tenant.nif} />
        <Field label="País" value={tenant.country} />
        <Field label="Moeda" value={tenant.currency} />
        <Field label="Idioma" value={tenant.language} />
      </div>
    </div>
  );
}
