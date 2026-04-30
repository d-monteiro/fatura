import { useState } from 'react';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { useTenantSuppliers } from '@/hooks/useTenantSuppliers';

export const NO_SUPPLIER_VALUE = '__no_supplier__';

interface SupplierComboboxProps {
  value: string;
  onValueChange: (v: string) => void;
  placeholder?: string;
  // 'filter' restringe a fornecedores com >0 faturas activas; 'all' mostra todos.
  scope?: 'filter' | 'all';
}

export function SupplierCombobox({ value, onValueChange, placeholder = 'Fornecedor', scope = 'filter' }: SupplierComboboxProps) {
  const [open, setOpen] = useState(false);
  const { suppliers, noSupplierCount, isLoading } = useTenantSuppliers({ scope });

  const supplierMatch = suppliers.find((s) => s.id === value);
  const selectedLabel = value === NO_SUPPLIER_VALUE
    ? 'Sem fornecedor'
    : supplierMatch
      ? (supplierMatch.display_name ?? supplierMatch.name)
      : null;

  const hasSelection = value !== '';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          className={cn(
            'inline-flex h-9 min-w-[7rem] max-w-[12rem] items-center justify-between gap-2 rounded-md border border-input bg-background px-2.5 text-sm transition-colors',
            'hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            hasSelection && 'border-primary/40 bg-primary/5 text-foreground',
          )}
        >
          <span className="truncate">{selectedLabel ?? placeholder}</span>
          {hasSelection ? (
            <span
              role="button"
              tabIndex={0}
              aria-label="Limpar fornecedor"
              onClick={(e) => {
                e.stopPropagation();
                onValueChange('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  onValueChange('');
                }
              }}
              className="rounded hover:bg-muted p-0.5 inline-flex"
            >
              <X className="h-3 w-3 opacity-60" />
            </span>
          ) : (
            <ChevronsUpDown className="h-4 w-4 opacity-50" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(22rem,calc(100vw-1rem))] p-0" align="start">
        <Command
          filter={(val, search) => {
            if (!search) return 1;
            return val.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
          }}
        >
          <CommandInput placeholder="Pesquisar fornecedor..." />
          <CommandList>
            <CommandEmpty>{isLoading ? 'A carregar...' : 'Sem resultados'}</CommandEmpty>

            {noSupplierCount > 0 && (
              <>
                <CommandGroup>
                  <CommandItem
                    value="sem fornecedor"
                    onSelect={() => {
                      onValueChange(value === NO_SUPPLIER_VALUE ? '' : NO_SUPPLIER_VALUE);
                      setOpen(false);
                    }}
                  >
                    <Check className={cn('h-4 w-4', value === NO_SUPPLIER_VALUE ? 'opacity-100' : 'opacity-0')} />
                    <span className="italic text-muted-foreground">Sem fornecedor</span>
                    <span className="ml-auto text-xs text-muted-foreground">{noSupplierCount}</span>
                  </CommandItem>
                </CommandGroup>
                <CommandSeparator />
              </>
            )}

            <CommandGroup>
              {suppliers.map((s) => {
                const label = s.display_name ?? s.name;
                const searchable = `${s.name} ${s.display_name ?? ''} ${s.nif ?? ''}`.trim();
                return (
                  <CommandItem
                    key={s.id}
                    value={searchable}
                    onSelect={() => {
                      onValueChange(s.id === value ? '' : s.id);
                      setOpen(false);
                    }}
                  >
                    <Check className={cn('h-4 w-4', value === s.id ? 'opacity-100' : 'opacity-0')} />
                    <span className="truncate">{label}</span>
                    {s.invoice_count != null && (
                      <span className="ml-auto text-xs text-muted-foreground">{s.invoice_count}</span>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
