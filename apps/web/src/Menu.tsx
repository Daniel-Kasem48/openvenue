import { useEffect, useId, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';

export function Menu({
  label,
  items,
}: {
  label: string;
  items: { label: string; onSelect: () => void; disabled?: boolean }[];
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const last = useRef(false);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const buttons = root.current!.querySelectorAll<HTMLButtonElement>(
      '[role="menuitem"]:not(:disabled)',
    );
    buttons[last.current ? buttons.length - 1 : 0]?.focus();
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  return (
    <div
      ref={root}
      className="relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button
        ref={trigger}
        className="secondary"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => {
          last.current = false;
          setOpen(!open);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            last.current = event.key === 'ArrowUp';
            setOpen(true);
          }
        }}
      >
        <MoreHorizontal className="size-4" aria-hidden="true" strokeWidth={1.75} />
      </button>
      {open && (
        <div
          id={id}
          role="menu"
          aria-label={label}
          className="absolute right-0 z-30 mt-1 min-w-52 rounded-xl bg-white p-1.5 shadow-float ring-1 ring-stone-200"
          onKeyDown={(event) => {
            const buttons = [
              ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
                '[role="menuitem"]:not(:disabled)',
              ),
            ];
            const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
            const key = event.key;
            if (key === 'Escape' || (key === 'Tab' && event.shiftKey)) {
              event.preventDefault();
              setOpen(false);
              trigger.current?.focus();
            } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(key) && buttons.length) {
              event.preventDefault();
              buttons[
                key === 'Home'
                  ? 0
                  : key === 'End'
                    ? buttons.length - 1
                    : (index + (key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
              ].focus();
            }
          }}
        >
          {items.map((item) => (
            <button
              key={item.label}
              role="menuitem"
              tabIndex={-1}
              disabled={item.disabled}
              className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-forest-50 focus:bg-forest-50"
              onClick={() => {
                setOpen(false);
                trigger.current?.focus();
                item.onSelect();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
