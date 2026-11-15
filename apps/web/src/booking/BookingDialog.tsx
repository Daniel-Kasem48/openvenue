import { useEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import type { BookingStep } from './BookingProgress';

export function BookingDialog({
  enabled,
  step,
  working,
  children,
}: {
  enabled: boolean;
  step: BookingStep;
  working: boolean;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [open, setOpen] = useState(true);
  useEffect(() => {
    if (!enabled) {
      setOpen(true);
      return;
    }
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [enabled, open]);
  useEffect(() => {
    if (enabled && open) {
      heading.current?.focus();
      dialog.current?.scrollTo(0, 0);
    }
  }, [enabled, open, step]);
  if (!enabled) return children;
  const title =
    step === 'time'
      ? 'Choose your visit'
      : step === 'place'
        ? 'Choose your place'
        : step === 'review'
          ? 'Review booking'
          : 'Booking complete';
  return (
    <>
      <section className="panel mx-auto max-w-xl p-8 text-center">
        <h2 className="mb-2 text-xl">
          {step === 'done' ? 'Your reservation is confirmed' : 'Your booking is in progress'}
        </h2>
        <p className="muted">
          {step === 'done'
            ? 'You can reopen your confirmation and save the reference.'
            : 'Your selections are saved while you explore.'}
        </p>
        <button className="primary" onClick={() => setOpen(true)}>
          {step === 'done' ? 'View confirmation' : 'Continue booking'}
        </button>
      </section>
      <dialog
        ref={dialog}
        aria-labelledby="booking-dialog-title"
        className={`booking-dialog max-h-[calc(100dvh-24px)] max-w-[calc(100vw-24px)] overflow-y-auto p-5 max-sm:p-3 ${step === 'place' ? 'w-[1280px]' : 'w-[680px]'}`}
        onCancel={(event) => {
          event.preventDefault();
          if (!working) setOpen(false);
        }}
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2
            id="booking-dialog-title"
            ref={heading}
            tabIndex={-1}
            className="text-xl focus:outline-none"
          >
            {title}
          </h2>
          <button
            className="secondary"
            aria-label="Close booking"
            disabled={working}
            onClick={() => setOpen(false)}
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
        {children}
      </dialog>
    </>
  );
}
