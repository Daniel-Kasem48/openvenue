import { useEffect, useState } from 'react';
import { formatPrice, overviewSchema, type OverviewData } from '@openvenue/contracts';
import { api } from './api';

function Occupancy({
  booked,
  capacity,
  label,
}: {
  booked: number;
  capacity: number;
  label: string;
}) {
  const percent = capacity ? Math.round((booked / capacity) * 100) : null;
  return (
    <div>
      <p>
        {label}: <strong>{percent === null ? '—' : `${percent}%`}</strong>{' '}
        <span className="muted">
          ({booked} / {capacity})
        </span>
      </p>
      <div className="mt-2 h-2 overflow-hidden rounded bg-stone-100" aria-hidden="true">
        <div
          className="h-full bg-forest-600"
          style={{ width: `${Math.min(percent ?? 0, 100)}%` }}
        />
      </div>
    </div>
  );
}
export function Overview({
  onReservations,
  onEvent,
}: {
  onReservations: () => void;
  onEvent: (venueId: string, showId: string) => void;
}) {
  const [days, setDays] = useState(1);
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const from = new Date();
    from.setUTCHours(0, 0, 0, 0);
    const to = new Date(+from + days * 86400000);
    setData(null);
    setError('');
    api<unknown>(
      `/overview?${new URLSearchParams({ from: from.toISOString(), to: to.toISOString() })}`,
      { signal: controller.signal },
    )
      .then((result) => setData(overviewSchema.parse(result)))
      .catch((e) => {
        if (e.name !== 'AbortError') setError(e.message);
      });
    return () => controller.abort();
  }, [days, refresh]);
  return (
    <section className="space-y-6" aria-label="Operator overview">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2>Overview</h2>
          <p className="muted">Confirmed reservations · Reporting days use UTC</p>
        </div>
        <div className="flex items-end gap-2">
          <label className="mb-0">
            Time range
            <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
              <option value={1}>Today</option>
              <option value={7}>Next 7 days</option>
              <option value={30}>Next 30 days</option>
            </select>
          </label>
          <button className="secondary" onClick={() => setRefresh((n) => n + 1)}>
            Refresh overview
          </button>
        </div>
      </div>
      {error && <p role="alert">{error}</p>}
      {!error && !data && <p role="status">Loading overview…</p>}
      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="panel p-5">
              <p className="muted">Reservations</p>
              <strong className="text-3xl">{data.reservations}</strong>
            </div>
            <div className="panel p-5">
              <p className="muted">Seats / places booked</p>
              <strong className="text-3xl">{data.placesBooked}</strong>
              <p className="muted">Includes restaurant party sizes</p>
            </div>
            <div className="panel space-y-3 p-5">
              <h3>Occupancy</h3>
              <Occupancy {...data.seats} label="Event seats" />
              <Occupancy {...data.resources} label="Daily tables / spaces" />
            </div>
            <div className="panel p-5">
              <h3>Expected revenue</h3>
              <p className="muted">Not collected</p>
              {data.revenue.length ? (
                data.revenue.map((r) => (
                  <p key={r.currency}>
                    <strong>{formatPrice(r.amount, r.currency)}</strong> {r.currency}
                  </p>
                ))
              ) : (
                <p>No reservations</p>
              )}
            </div>
          </div>
          <p className="muted">
            Event occupancy uses available seats across events, after blocks. Daily utilization
            counts each table or parking space once per reporting day; it does not measure hours
            occupied.
          </p>
          <section className="panel p-5">
            <h3>Upcoming events in range</h3>
            {!data.events.length && <p className="muted">No events in this range.</p>}
            <div className="mt-4 grid gap-5 md:grid-cols-2">
              {data.events.map((event) => (
                <article
                  key={event.id}
                  className="space-y-2 rounded-lg border border-stone-200 p-4"
                >
                  <h4>{event.title}</h4>
                  <p>
                    {event.venueName} · {new Date(event.start).toLocaleString()}
                  </p>
                  <Occupancy
                    booked={event.sold}
                    capacity={event.capacity}
                    label="Sold / available seats"
                  />
                  <p className="muted">{event.blocked} blocked seats</p>
                  <button className="secondary" onClick={() => onEvent(event.venueId, event.id)}>
                    Manage event seats: {event.title}
                  </button>
                </article>
              ))}
            </div>
          </section>
          <section className="panel p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3>Recent reservations in range</h3>
              <button className="secondary" onClick={onReservations}>
                View reservations
              </button>
            </div>
            {!data.recent.length && <p className="muted">No reservations in this range.</p>}
            <ul className="mt-3 divide-y divide-stone-100">
              {data.recent.map((booking) => (
                <li className="py-3" key={booking.id}>
                  <strong>{booking.guestName}</strong>
                  <p>
                    {booking.venueName} · {booking.resourceLabel} ·{' '}
                    {new Date(booking.start).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h3>Venue occupancy</h3>
            <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {data.venues.map((venue) => (
                <article className="panel space-y-2 p-5" key={venue.id}>
                  <h4>{venue.name}</h4>
                  <p className="muted">
                    {venue.event
                      ? `${venue.event.title} · ${new Date(venue.event.start).toLocaleString()}`
                      : ['cinema', 'stadium'].includes(venue.kind)
                        ? 'No upcoming event'
                        : 'Today (UTC)'}
                  </p>
                  <Occupancy {...venue} label={venue.event ? 'Next event' : 'Utilization'} />
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </section>
  );
}
