import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { Company } from '@/types/database';

interface CompanySelectorProps {
  companyOpen: boolean;
  setCompanyOpen: (v: boolean) => void;
  currentLabel: string;
  activeCompany: string;
  companies: Company[];
  selectCompany: (id: string) => void;
  allLabel: string;
}

export function CompanySelector({
  companyOpen, setCompanyOpen, currentLabel,
  activeCompany, companies, selectCompany, allLabel,
}: CompanySelectorProps) {
  return (
    <div className="relative px-3 pb-4">
      <button onClick={() => setCompanyOpen(!companyOpen)}
        className="flex w-full items-center justify-between rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/15 transition-colors">
        <span>{currentLabel}</span>
        <ChevronDown size={16} className={cn('transition-transform', companyOpen && 'rotate-180')} />
      </button>
      {companyOpen && (
        <div className="absolute left-3 right-3 top-full mt-1 rounded-lg bg-white text-foreground shadow-lg overflow-hidden">
          <button onClick={() => selectCompany('all')}
            className={cn('block w-full px-3 py-2 text-left text-sm hover:bg-muted transition-colors',
              activeCompany === 'all' && 'font-semibold text-accent-foreground')}>
            {allLabel}
          </button>
          {companies.map((c) => (
            <button key={c.id} onClick={() => selectCompany(c.id)}
              className={cn('block w-full px-3 py-2 text-left text-sm hover:bg-muted transition-colors',
                c.id === activeCompany && 'font-semibold text-accent-foreground')}>
              {c.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
