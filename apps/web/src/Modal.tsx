import { X } from 'lucide-react';
import { useRef, useEffect, type ReactNode } from 'react';
export function Modal({
  title,
  children,
  onClose,
  className,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    ref.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
  }, []);
  return (
    <dialog className={className} ref={ref} onCancel={onClose}>
      <div className="modal-head mb-4 flex items-center justify-between gap-4">
        <h2 className="text-xl">{title}</h2>
        <button
          className="grid size-8 place-items-center rounded-lg text-xl text-stone-400 transition hover:bg-stone-100 hover:text-ink"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X className="size-4 inline-block shrink-0" aria-hidden="true" strokeWidth={1.75} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
