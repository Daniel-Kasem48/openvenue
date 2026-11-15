export type BookingStep = 'venues' | 'time' | 'place' | 'review' | 'done';
export function BookingProgress({ step, publicPage }: { step: BookingStep; publicPage: boolean }) {
  const steps: BookingStep[] = publicPage
    ? ['time', 'place', 'review', 'done']
    : ['venues', 'time', 'place', 'review'];
  const labels = { venues: 'Venue', time: 'Time', place: 'Place', review: 'Review', done: 'Done' };
  return (
    <nav
      className="booking-steps mb-6 flex flex-wrap items-center gap-2"
      aria-label="Booking progress"
    >
      {steps.map((item, i) => (
        <span
          key={item}
          aria-current={step === item ? 'step' : undefined}
          className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition max-sm:px-2.5 max-sm:text-xs ${step === item ? 'bg-forest-800 text-white shadow-sm' : i < steps.indexOf(step) ? 'bg-forest-50 text-forest-700 ring-1 ring-forest-100' : 'bg-white text-stone-500 ring-1 ring-stone-200'}`}
        >
          {i + 1}. {labels[item]}
        </span>
      ))}
    </nav>
  );
}
