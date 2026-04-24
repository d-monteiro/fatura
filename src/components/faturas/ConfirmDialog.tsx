interface Props {
  open: boolean;
  title: string;
  description: string;
  cancelLabel: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  destructive?: boolean;
}

export function ConfirmDialog({
  open, title, description, cancelLabel, confirmLabel,
  onCancel, onConfirm, destructive = false,
}: Props) {
  if (!open) return null;
  const confirmClass = destructive
    ? 'rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700'
    : 'rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90';
  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/40" onClick={onCancel} />
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <p className="mt-2 text-sm text-gray-500">{description}</p>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={onCancel}
              className="rounded-lg border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              {cancelLabel}
            </button>
            <button onClick={onConfirm} className={confirmClass}>
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
