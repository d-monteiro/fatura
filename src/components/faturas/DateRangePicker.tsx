import { useState } from 'react';
import { Calendar as CalendarIcon, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';

interface DateRangePickerProps {
  start: string;
  end: string;
  onChange: (next: { start: string; end: string }) => void;
  startLabel?: string;
  endLabel?: string;
}

function toIso(d: Date | undefined): string {
  if (!d) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fromIso(s: string): Date | undefined {
  if (!s) return undefined;
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}

function formatPt(iso: string): string {
  const d = fromIso(iso);
  if (!d) return '';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

interface FieldProps {
  value: string;
  onSelect: (iso: string) => void;
  placeholder: string;
  minDate?: Date;
  maxDate?: Date;
}

function DateField({ value, onSelect, placeholder, minDate, maxDate }: FieldProps) {
  const [open, setOpen] = useState(false);
  const selected = fromIso(value);
  const hasValue = !!value;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex h-9 items-center justify-between gap-1.5 rounded-md border border-input bg-background px-2.5 text-sm transition-colors min-w-[7.5rem]',
            'hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            hasValue && 'border-primary/40 bg-primary/5 text-foreground',
          )}
        >
          <span className="flex items-center gap-2 truncate">
            <CalendarIcon className="h-4 w-4 opacity-60" />
            {hasValue ? formatPt(value) : placeholder}
          </span>
          {hasValue && (
            <span
              role="button"
              tabIndex={0}
              aria-label="Limpar data"
              onClick={(e) => {
                e.stopPropagation();
                onSelect('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  onSelect('');
                }
              }}
              className="rounded hover:bg-muted p-0.5 inline-flex"
            >
              <X className="h-3 w-3 opacity-60" />
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(d) => {
            onSelect(toIso(d));
            setOpen(false);
          }}
          disabled={(date) => {
            if (minDate && date < minDate) return true;
            if (maxDate && date > maxDate) return true;
            return false;
          }}
          defaultMonth={selected ?? minDate ?? new Date()}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}

export function DateRangePicker({
  start,
  end,
  onChange,
  startLabel = 'Desde',
  endLabel = 'Até',
}: DateRangePickerProps) {
  const startDate = fromIso(start);
  const endDate = fromIso(end);

  return (
    <div className="flex items-center gap-1">
      <DateField
        value={start}
        placeholder={startLabel}
        maxDate={endDate}
        onSelect={(next) => {
          if (next && end && fromIso(next)! > endDate!) {
            onChange({ start: next, end: '' });
          } else {
            onChange({ start: next, end });
          }
        }}
      />
      <span className="text-muted-foreground text-sm">→</span>
      <DateField
        value={end}
        placeholder={endLabel}
        minDate={startDate}
        onSelect={(next) => onChange({ start, end: next })}
      />
    </div>
  );
}
