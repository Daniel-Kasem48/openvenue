import { useRef, useEffect, type ReactNode } from 'react';
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    ref.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
  }, []);
  return (
    <dialog ref={ref} onCancel={onClose}>
      <div className="modal-head">
        <h2>{title}</h2>
        <button aria-label="Close dialog" onClick={onClose}>
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
