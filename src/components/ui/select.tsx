import * as React from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';

interface SelectContextValue {
  value: string;
  onValueChange: (value: string) => void;
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  registerItem: (value: string, label: React.ReactNode) => void;
  labels: Map<string, React.ReactNode>;
  disabled: boolean;
  triggerRef: React.MutableRefObject<HTMLButtonElement | null>;
}

const SelectContext = React.createContext<SelectContextValue>({
  value: '',
  onValueChange: () => {},
  open: false,
  setOpen: () => {},
  registerItem: () => {},
  labels: new Map(),
  disabled: false,
  triggerRef: { current: null },
});

function Select({
  value: controlledValue,
  onValueChange,
  defaultValue = '',
  disabled = false,
  children,
}: {
  value?: string;
  onValueChange?: (value: string) => void;
  defaultValue?: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const [internalValue, setInternalValue] = React.useState(defaultValue);
  const [open, setOpen] = React.useState(false);
  const [labels, setLabels] = React.useState<Map<string, React.ReactNode>>(new Map());
  const value = controlledValue ?? internalValue;
  const handleChange = onValueChange ?? setInternalValue;
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);

  const registerItem = React.useCallback((v: string, label: React.ReactNode) => {
    setLabels((prev) => {
      if (prev.get(v) === label) return prev;
      const next = new Map(prev);
      next.set(v, label);
      return next;
    });
  }, []);

  return (
    <SelectContext.Provider
      value={{ value, onValueChange: handleChange, open, setOpen, registerItem, labels, disabled, triggerRef }}
    >
      <div className="relative">{children}</div>
    </SelectContext.Provider>
  );
}

type SelectTriggerProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  size?: 'default' | 'sm';
};

const SelectTrigger = React.forwardRef<HTMLButtonElement, SelectTriggerProps>(
  ({ className, children, size = 'default', onKeyDown, ...props }, ref) => {
    const { open, setOpen, disabled, triggerRef } = React.useContext(SelectContext);

    const combinedRef = React.useCallback(
      (node: HTMLButtonElement | null) => {
        triggerRef.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) ref.current = node;
      },
      [ref, triggerRef],
    );

    return (
      <button
        ref={combinedRef}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={disabled}
        className={cn(
          'flex w-full items-center justify-between rounded-md border border-input bg-background text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1',
          size === 'default' && 'h-10 px-3 py-2',
          size === 'sm' && 'h-9 px-3 py-1.5 text-sm',
          className,
        )}
        onClick={() => !disabled && setOpen((prev) => !prev)}
        onKeyDown={(e) => {
          onKeyDown?.(e);
          if (e.defaultPrevented) return;
          if ((e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        {...props}
      >
        {children}
        <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </button>
    );
  },
);
SelectTrigger.displayName = 'SelectTrigger';

function SelectValue({ placeholder }: { placeholder?: string }) {
  const { value, labels } = React.useContext(SelectContext);
  if (!value) return <span className="text-muted-foreground">{placeholder}</span>;
  const label = labels.get(value);
  return <span>{label ?? value}</span>;
}

function SelectContent({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const { open, setOpen, triggerRef } = React.useContext(SelectContext);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (ref.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      setOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, setOpen, triggerRef]);

  return (
    <div
      ref={ref}
      role="listbox"
      className={cn(
        'absolute z-50 mt-1 max-h-60 min-w-full overflow-auto rounded-md border border-border bg-card p-1 text-card-foreground shadow-lg',
        !open && 'hidden',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

function SelectItem({
  className,
  value,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { value: string }) {
  const { value: selectedValue, onValueChange, setOpen, registerItem, triggerRef } = React.useContext(SelectContext);

  React.useEffect(() => {
    registerItem(value, children);
  }, [value, children, registerItem]);

  const selected = selectedValue === value;

  return (
    <div
      role="option"
      aria-selected={selected}
      tabIndex={0}
      className={cn(
        'relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground',
        selected && 'bg-accent/60 font-medium',
        className,
      )}
      onClick={() => {
        onValueChange(value);
        setOpen(false);
        triggerRef.current?.focus();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onValueChange(value);
          setOpen(false);
          triggerRef.current?.focus();
        }
      }}
      {...props}
    >
      {selected && (
        <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
          <Check className="h-4 w-4" />
        </span>
      )}
      {children}
    </div>
  );
}

function SelectGroup({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div role="group" {...props}>{children}</div>;
}

function SelectLabel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('py-1.5 pl-8 pr-2 text-xs font-semibold text-muted-foreground', className)} {...props} />;
}

function SelectSeparator({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('-mx-1 my-1 h-px bg-muted', className)} {...props} />;
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};
