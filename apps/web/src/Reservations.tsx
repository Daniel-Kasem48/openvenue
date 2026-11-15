import { useEffect, useState } from 'react';
import {
  formatPrice,
  type AdminBooking,
  type BookingPage,
  type Show,
  type Venue,
} from '@openvenue/contracts';
import { api, json } from './api';
import { Modal } from './Modal';

const statusName = (booking: AdminBooking) =>
  booking.status === 'confirmed'
    ? booking.checkedInAt
      ? 'Checked in'
      : 'Confirmed'
    : booking.status === 'no_show'
      ? 'No-show'
      : 'Cancelled';
const cell = 'border-t border-stone-100 px-4 py-3 align-top';
export function Reservations({
  staff = false,
  onMessage,
  onChange,
}: {
  staff?: boolean;
  onMessage: (message: string) => void;
  onChange: () => void;
}) {
  const [venues, setVenues] = useState<Venue[]>([]),
    [events, setEvents] = useState<Show[]>([]);
  const [filters, setFilters] = useState({
    venueId: '',
    showId: '',
    from: '',
    to: '',
    status: 'confirmed',
    q: '',
  });
  const [items, setItems] = useState<AdminBooking[]>([]),
    [cursor, setCursor] = useState(''),
    [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<AdminBooking | null>(null),
    [notes, setNotes] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    api<Venue[]>(staff ? '/venues' : '/venues?includeArchived=1', { signal: controller.signal })
      .then(setVenues)
      .catch((e) => {
        if (e.name !== 'AbortError') setError(e.message);
      });
    return () => controller.abort();
  }, [staff]);
  useEffect(() => {
    const controller = new AbortController();
    setEvents([]);
    if (filters.venueId)
      api<Show[]>(`/venues/${filters.venueId}/${staff ? 'shows' : 'events'}`, {
        signal: controller.signal,
      })
        .then(setEvents)
        .catch((e) => {
          if (e.name !== 'AbortError') setError(e.message);
        });
    return () => controller.abort();
  }, [filters.venueId, staff]);
  const parameters = new URLSearchParams({ status: filters.status, q: filters.q.trim() });
  if (filters.venueId) parameters.set('venueId', filters.venueId);
  if (filters.showId) parameters.set('showId', filters.showId);
  if (filters.from) parameters.set('from', new Date(filters.from + 'T00:00:00').toISOString());
  if (filters.to) {
    const until = new Date(filters.to + 'T00:00:00');
    until.setDate(until.getDate() + 1);
    parameters.set('to', until.toISOString());
  }
  const query = parameters.toString();
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    if (!cursor) setItems([]);
    const timer = setTimeout(() => {
      api<BookingPage>(
        `/bookings?${query}${cursor ? '&cursor=' + encodeURIComponent(cursor) : ''}`,
        { signal: controller.signal },
      )
        .then((page) => {
          setItems((previous) => (cursor ? [...previous, ...page.items] : page.items));
          setNextCursor(page.nextCursor);
        })
        .catch((e) => {
          if (e.name !== 'AbortError') setError(e.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, cursor, revision]);
  const filter = (key: keyof typeof filters, value: string) => {
    setCursor('');
    setFilters((old) => ({ ...old, [key]: value, ...(key === 'venueId' ? { showId: '' } : {}) }));
  };
  const open = (booking: AdminBooking) => {
    setSelected(booking);
    setNotes(booking.notes);
    setError('');
  };
  const update = async (
    booking: AdminBooking,
    change: { notes?: string; checkedIn?: boolean; status?: 'cancelled' | 'no_show' },
  ) => {
    setBusy(true);
    setError('');
    try {
      const updated = await api<AdminBooking>(`/bookings/${booking.id}`, json(change, 'PATCH'));
      setSelected((current) => (current?.id === booking.id ? updated : current));
      setCursor('');
      setRevision((n) => n + 1);
      onChange();
      onMessage(
        change.notes !== undefined
          ? 'Notes saved.'
          : change.status === 'cancelled'
            ? 'Reservation cancelled.'
            : change.status === 'no_show'
              ? 'Reservation marked no-show.'
              : change.checkedIn
                ? 'Guest checked in.'
                : 'Check-in undone.',
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="panel booking-list p-5 max-sm:p-3">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2>Reservations</h2>
          <p className="muted">{items.length} shown · Dates use your local timezone</p>
        </div>
        <a className="secondary" href={'/api/bookings.csv?' + query} download="reservations.csv">
          Export CSV
        </a>
      </div>
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <label>
          Venue
          <select value={filters.venueId} onChange={(e) => filter('venueId', e.target.value)}>
            <option value="">All venues</option>
            {venues.map((venue) => (
              <option key={venue.id} value={venue.id}>
                {venue.name}
                {venue.archivedAt ? ' (archived)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label>
          Event
          <select
            value={filters.showId}
            disabled={!filters.venueId}
            onChange={(e) => filter('showId', e.target.value)}
          >
            <option value="">All events</option>
            {events.map((event) => (
              <option key={event.id} value={event.id}>
                {event.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          From date
          <input
            type="date"
            value={filters.from}
            onChange={(e) => filter('from', e.target.value)}
          />
        </label>
        <label>
          To date
          <input type="date" value={filters.to} onChange={(e) => filter('to', e.target.value)} />
        </label>
        <label>
          Status
          <select value={filters.status} onChange={(e) => filter('status', e.target.value)}>
            <option value="confirmed">Confirmed</option>
            <option value="cancelled">Cancelled</option>
            <option value="no_show">No-show</option>
            <option value="all">All statuses</option>
          </select>
        </label>
        <label className="attendee-search">
          Search attendees
          <input
            type="search"
            maxLength={100}
            value={filters.q}
            onChange={(e) => filter('q', e.target.value)}
            placeholder="Name, email or reference"
          />
        </label>
      </div>
      {error && !selected && <p role="alert">{error}</p>}
      {loading && <p aria-live="polite">Loading reservations…</p>}
      {!loading && !items.length && <p className="empty">No reservations match this attendee.</p>}
      {!!items.length && (
        <div className="table-scroll overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                {['Guest', 'Venue / resource', 'Party / price', 'When', 'Status', 'Actions'].map(
                  (title) => (
                    <th className="px-4 py-2" key={title}>
                      {title}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {items.map((booking) => (
                <tr
                  className="cursor-pointer hover:bg-stone-50"
                  key={booking.id}
                  onClick={() => open(booking)}
                >
                  <td className={cell}>
                    <button className="text-left font-semibold" onClick={() => open(booking)}>
                      {booking.guestName}
                    </button>
                    <small className="booking-reference">{booking.id}</small>
                  </td>
                  <td className={cell}>
                    {booking.venueName}
                    <small>{booking.seatLocation ?? booking.resourceLabel}</small>
                    <small>{booking.eventTitle}</small>
                  </td>
                  <td className={cell}>
                    {booking.partySize} {booking.partySize === 1 ? 'guest' : 'guests'}
                    <small>{formatPrice(booking.price, booking.currency)} · Not paid</small>
                  </td>
                  <td className={cell}>
                    {new Date(booking.start).toLocaleString()}
                    <small>to {new Date(booking.end).toLocaleString()}</small>
                  </td>
                  <td className={cell}>
                    <span className="pill">{statusName(booking)}</span>
                  </td>
                  <td className={cell}>
                    {!staff && booking.status === 'confirmed' && (
                      <button
                        className="text-button danger"
                        aria-label="Cancel reservation"
                        disabled={busy}
                        onClick={(e) => {
                          e.stopPropagation();
                          void update(booking, { status: 'cancelled' });
                        }}
                      >
                        Cancel
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {nextCursor && (
        <button
          className="secondary mt-4"
          disabled={loading || busy}
          onClick={() => {
            setCursor(nextCursor);
            setRevision((n) => n + 1);
          }}
        >
          Load more reservations
        </button>
      )}
      {selected && (
        <Modal
          title="Reservation details"
          className="fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-dvh w-full max-w-lg rounded-none p-6 max-sm:max-w-full"
          onClose={() => setSelected(null)}
        >
          <div className="space-y-4 break-words">
            <div>
              <h3>{selected.guestName}</h3>
              <p className="booking-reference">{selected.id}</p>
              <span className="pill">{statusName(selected)}</span>
            </div>
            <p>
              {selected.venueName} · {selected.seatLocation ?? selected.resourceLabel}
              <small>{selected.eventTitle}</small>
            </p>
            <p>
              {new Date(selected.start).toLocaleString()} –{' '}
              {new Date(selected.end).toLocaleString()}
            </p>
            <p>
              {selected.partySize} guests · {formatPrice(selected.price, selected.currency)}{' '}
              {selected.currency} · Not collected
            </p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
              <dt>Email</dt>
              <dd className="min-w-0 break-all">{selected.guestEmail || 'Not provided'}</dd>
              <dt>Phone</dt>
              <dd>{selected.guestPhone || 'Not provided'}</dd>
            </dl>
            <label>
              Staff notes
              <textarea
                readOnly={staff}
                maxLength={4000}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={busy}
              />
            </label>
            {!staff && (
              <button
                className="secondary"
                disabled={busy || notes === selected.notes}
                onClick={() => void update(selected, { notes })}
              >
                Save notes
              </button>
            )}
            {selected.status === 'confirmed' && (
              <div className="flex flex-wrap gap-2">
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => void update(selected, { checkedIn: !selected.checkedInAt })}
                >
                  {selected.checkedInAt ? 'Undo check-in' : 'Check in'}
                </button>
                {!staff && (
                  <>
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() => void update(selected, { status: 'no_show' })}
                    >
                      Mark no-show
                    </button>
                    <button
                      className="danger"
                      aria-label="Cancel reservation"
                      disabled={busy}
                      onClick={() => void update(selected, { status: 'cancelled' })}
                    >
                      Cancel
                    </button>
                  </>
                )}
              </div>
            )}
            {error && <p role="alert">{error}</p>}
          </div>
        </Modal>
      )}
    </section>
  );
}
