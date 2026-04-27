import * as React from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Input } from './input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './select';

const ALL_VALUE = '__all__';

export interface FilterOption {
  value: string;
  label: React.ReactNode;
}

interface FilterSearchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'size'> {
  value: string;
  onValueChange: (v: string) => void;
  placeholder?: string;
  size?: 'default' | 'sm';
}

export function FilterSearch({
  value,
  onValueChange,
  placeholder,
  className,
  size = 'default',
  ...rest
}: FilterSearchProps) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        placeholder={placeholder}
        className={cn('pl-9', size === 'sm' && 'h-9', className)}
        {...rest}
      />
    </div>
  );
}

interface FilterSelectProps {
  value: string;
  onValueChange: (v: string) => void;
  options: FilterOption[];
  placeholder: string;
  allOptionLabel?: string;
  size?: 'default' | 'sm';
  className?: string;
  disabled?: boolean;
}

// value='' significa "sem filtro". Quando há valor, mostra X inline para limpar individualmente.
// `allOptionLabel` (opcional) ainda permite item de topo que faz reset, mas o X torna-o redundante.
export function FilterSelect({
  value,
  onValueChange,
  options,
  placeholder,
  allOptionLabel,
  size = 'sm',
  className,
  disabled,
}: FilterSelectProps) {
  const internalValue = value === '' ? '' : value;
  const hasValue = !!value && !disabled;

  return (
    <Select
      value={internalValue}
      disabled={disabled}
      onValueChange={(v) => onValueChange(v === ALL_VALUE ? '' : v)}
    >
      <SelectTrigger
        size={size}
        className={cn(
          'min-w-[7rem] sm:w-auto',
          hasValue && 'border-primary/40 bg-primary/5 text-foreground pr-7',
          className,
        )}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      {hasValue && (
        <button
          type="button"
          aria-label="Limpar filtro"
          tabIndex={-1}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onValueChange('');
          }}
          className="absolute right-2 top-1/2 z-10 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded bg-primary/5 hover:bg-muted"
        >
          <X className="h-3 w-3 opacity-70" />
        </button>
      )}
      <SelectContent>
        {allOptionLabel && <SelectItem value={ALL_VALUE}>{allOptionLabel}</SelectItem>}
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

interface FilterBarProps {
  children: React.ReactNode;
  onClear?: () => void;
  hasActive?: boolean;
  clearLabel?: string;
  className?: string;
}

export function FilterBar({ children, onClear, hasActive, clearLabel = 'Limpar', className }: FilterBarProps) {
  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {children}
      {hasActive && onClear && (
        <button
          type="button"
          onClick={onClear}
          className="inline-flex h-9 items-center gap-1 rounded-md border border-input bg-background px-3 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          <X className="h-3 w-3" />
          {clearLabel}
        </button>
      )}
    </div>
  );
}
