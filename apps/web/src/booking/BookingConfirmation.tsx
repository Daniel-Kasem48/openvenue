import { Check } from 'lucide-react';
import { formatPrice, seatLocation, type Booking, type Venue } from '@openvenue/contracts';

export function BookingConfirmation({
  confirmation,
  venue,
  onAgain,
}: {
  confirmation: Booking & { bookings?: Booking[] };
  venue?: Venue;
  onAgain: () => void;
}) {
  const confirmed = confirmation.bookings ?? [confirmation];
  const seatVenue = venue?.kind === 'cinema' || venue?.kind === 'stadium';
  return (
    <section
      className="panel journey-panel mx-auto max-w-[640px] p-8 max-sm:p-6"
      aria-label="Booking confirmation"
    >
      <div
        className="confirmation-mark grid size-12 place-items-center rounded-full bg-forest-100 text-2xl text-forest-700 ring-8 ring-forest-50"
        aria-hidden="true"
      >
        <Check className="size-4 inline-block shrink-0" aria-hidden="true" strokeWidth={1.75} />
      </div>
      <h2 className="mt-6 mb-1 text-[26px]">Reservation confirmed</h2>
      <p className="text-stone-500">Save these details for your arrival.</p>
      <dl className="booking-summary my-6 grid grid-cols-[100px_minmax(0,1fr)] gap-x-4 gap-y-3 rounded-xl bg-stone-50 p-5 text-[13px] ring-1 ring-stone-100 [&_dd]:m-0 [&_dd]:font-medium [&_dd]:wrap-anywhere [&_dt]:text-stone-500">
        <dt>Venue</dt>
        <dd>{venue?.name}</dd>
        <dt>Place</dt>
        <dd>
          {confirmed
            .map(
              (b) =>
                b.seatLocation ??
                (() => {
                  const seat = venue?.layout.floors
                    .flatMap((f) => f.resources)
                    .find((r) => r.id === b.resourceId);
                  return seat ? seatLocation(seat) : 'Seat';
                })(),
            )
            .join(', ')}
        </dd>
        <dt>{seatVenue ? 'Seats' : 'Guests'}</dt>
        <dd>{seatVenue ? confirmed.length : confirmation.partySize}</dd>
        <dt>Total</dt>
        <dd className="tabular-nums">
          {formatPrice(
            confirmed.reduce((sum, b) => sum + b.price, 0),
            confirmation.currency,
          )}{' '}
          · Not paid
        </dd>
        <dt>Guest</dt>
        <dd>{confirmation.guestName}</dd>
        <dt>From</dt>
        <dd>{new Date(confirmation.start).toLocaleString()}</dd>
        <dt>Until</dt>
        <dd>{new Date(confirmation.end).toLocaleString()}</dd>
        <dt>Reference</dt>
        <dd className="booking-reference">
          {confirmed.map((b) => (
            <div key={b.id}>{b.id}</div>
          ))}
        </dd>
      </dl>
      <p className="muted">
        To change or cancel your reservation, contact the venue and quote this reference.
      </p>
      <button className="primary" onClick={onAgain}>
        Book another visit
      </button>
    </section>
  );
}
