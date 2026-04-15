import * as React from 'react';
import { cn } from '@/lib/cn';

interface SelectContextValue {
  value: string;
  onValueChange: (value: string) => void;
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  registerItem: (value: string, label: React.ReactNode) => void;
  labels: Map<string, React.ReactNode>;
}

const SelectContext = React.createContext<SelectContextValue>({
  value: '',
  onValueChange: () => {},
  open: false,
  setOpen: () => {},
  registerItem: () => {},
  labels: new Map(),
});

function Select({
  value: controlledValue,
  onValueChange,
  defaultValue = '',
  children,
}: {
  value?: string;
  onValueChange?: (value: string) => void;
  defaultValue?: string;
  children: React.ReactNode;
}) {
  const [internalValue, setInternalValue] = React.useState(defaultValue);
  const [open, setOpen] = React.useState(false);
  const [labels, setLabels] = React.useState<Map<string, React.ReactNode>>(new Map());
  const value = controlledValue ?? internalValue;
  const handleChange = onValueChange ?? setInternalValue;

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
      value={{ value, onValueChange: handleChange, open, setOpen, registerItem, labels }}
    >
      <div className="relative">
        {children}
      </div>
    </SelectContext.Provider>
  );
}

const SelectTrigger = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ className, children, ...props }, ref) => {
    const { open, setOpen } = React.useContext(SelectContext);

    return (
      <button
        ref={ref}
        type="button"
        role="combobox"
        aria-expanded={open}
        className={cn(
          'flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1',
          className,
        )}
        onClick={() => setOpen((prev) => !prev)}
        {...props}
      >
        {children}
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-2 h-4 w-4 shrink-0 opacity-50">
          <path d="m6 9 6 6 6-6" />
        </svg>
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
  const { open, setOpen } = React.useContext(SelectContext);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open, setOpen]);

  // Always render children so SelectItem components can register their labels
  // in the context. Hide visually when closed.
  return (
    <div
      ref={ref}
      className={cn(
        'absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-white p-1 text-black shadow-lg',
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
  const { value: selectedValue, onValueChange, setOpen, registerItem } = React.useContext(SelectContext);

  React.useEffect(() => {
    registerItem(value, children);
  }, [value, children, registerItem]);

  return (
    <div
      role="option"
      aria-selected={selectedValue === value}
      className={cn(
        'relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm text-black outline-none hover:bg-gray-100',
        selectedValue === value && 'bg-gray-100 font-medium',
        className,
      )}
      onClick={() => {
        onValueChange(value);
        setOpen(false);
      }}
      {...props}
    >
      {selectedValue === value && (
        <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
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
  return (
    <div className={cn('py-1.5 pl-8 pr-2 text-sm font-semibold', className)} {...props} />
  );
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
