import { Modal } from './Modal';
import { SceneBoundary } from './SceneBoundary';
import { GenerateSceneDialog } from './GenerateSceneDialog';
import { LayoutInspector } from './LayoutInspector';
import { Suspense, lazy, useEffect, useState } from 'react';
import {
  reservationPrice,
  formatPrice,
  cloneLayout,
  intervalSchema,
  layoutSchema,
  type Booking,
  type Layout,
  type Resource,
  type Show,
  type Venue,
  type VenueKind,
} from '@openvenue/contracts';
import { api, json, localTime } from './api';
import Map2D from './Map2D';
const Map3D = lazy(() => import('./Map3D'));
const types: Record<VenueKind, { icon: string; name: string; description: string }> = {
  restaurant: { icon: '◉', name: 'Restaurant', description: 'Tables, chairs & good company' },
  parking: { icon: '▤', name: 'Parking', description: 'A place for every arrival' },
  stadium: { icon: '◉', name: 'Stadium', description: 'Sections, rows & match days' },
  cinema: { icon: '▥', name: 'Cinema', description: 'Every seat has a story' },
};
export default function App() {
  const [step, setStep] = useState<'venues' | 'time' | 'place' | 'review' | 'done'>('venues');
  const [confirmation, setConfirmation] = useState<(Booking & { bookings?: Booking[] }) | null>(
    null,
  );
  const [emptyLayout, setEmptyLayout] = useState(false);
  const [partySize, setPartySize] = useState(1);
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);
  const [filter, setFilter] = useState<VenueKind | 'all'>('all');
  const [venues, setVenues] = useState<Venue[]>([]),
    [venueId, setVenueId] = useState(''),
    [draft, setDraft] = useState<Venue | null>(null);
  const [floorIndex, setFloorIndex] = useState(0),
    [selected, setSelected] = useState(''),
    [view, setView] = useState<'2d' | '3d'>('3d');
  const [admin, setAdmin] = useState(false),
    [editing, setEditing] = useState(false),
    [dirty, setDirty] = useState(false),
    [tab, setTab] = useState<'map' | 'bookings'>('map');
  const [modal, setModal] = useState<'login' | 'venue' | 'show' | 'generate' | null>(null),
    [source, setSource] = useState<Venue | null>(null);
  const [kind, setKind] = useState<VenueKind>('restaurant'),
    [newName, setNewName] = useState(''),
    [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const openLogin = () => {
    setError('');
    setPassword('');
    setShowPassword(false);
    setModal('login');
  };
  const closeLogin = () => {
    setPassword('');
    setShowPassword(false);
    setError('');
    setModal(null);
  };
  const [start, setStart] = useState(() => localTime(new Date(Date.now() + 3600000))),
    [end, setEnd] = useState(() => localTime(new Date(Date.now() + 7200000)));
  const [shows, setShows] = useState<Show[]>([]),
    [showId, setShowId] = useState(''),
    [showTitle, setShowTitle] = useState('');
  const [busy, setBusy] = useState<string[]>([]),
    [availabilityReady, setAvailabilityReady] = useState(false),
    [guest, setGuest] = useState(''),
    [bookings, setBookings] = useState<Booking[]>([]);
  const [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [working, setWorking] = useState(false),
    [loaded, setLoaded] = useState(false),
    [refresh, setRefresh] = useState(0);
  const venue = venues.find((v) => v.id === venueId),
    current = editing && draft ? draft : venue,
    floor = current?.layout.floors[floorIndex],
    resource = floor?.resources.find((r) => r.id === selected);
  const seatVenue = venue?.kind === 'cinema' || venue?.kind === 'stadium';
  const bookingResources = seatVenue
    ? (venue?.layout.floors
        .flatMap((f) => f.resources)
        .filter((r) => selectedSeats.includes(r.id)) ?? [])
    : resource
      ? [resource]
      : [];
  const total = venue
    ? bookingResources.reduce((sum, r) => sum + reservationPrice(venue.layout, r), 0)
    : 0;
  const currency = venue?.layout.pricing.currency ?? 'USD';
  useEffect(() => {
    const ids = new Set(venue?.layout.floors.flatMap((f) => f.resources.map((r) => r.id)) ?? []);
    setSelectedSeats((current) => current.filter((id) => ids.has(id)));
  }, [venue]);
  const selectPlace = (id: string) => {
    if (editing || !seatVenue) {
      setSelected(id);
      return;
    }
    if (!id) return;
    if (selectedSeats.includes(id)) {
      setSelectedSeats(selectedSeats.filter((s) => s !== id));
      return;
    }
    if (busy.includes(id)) return;
    if (partySize === 1) {
      setSelectedSeats([id]);
      return;
    }
    if (selectedSeats.length >= partySize) return;
    setSelectedSeats([...selectedSeats, id]);
  };
  const activeShow = shows.find((s) => s.id === showId);
  const timeResult = intervalSchema.safeParse({
    start:
      activeShow && seatVenue
        ? activeShow.start
        : start && Number.isFinite(Date.parse(start))
          ? new Date(start).toISOString()
          : '',
    end:
      activeShow && seatVenue
        ? activeShow.end
        : end && Number.isFinite(Date.parse(end))
          ? new Date(end).toISOString()
          : '',
  });
  const interval = timeResult.success ? timeResult.data : null;
  const run = async (work: () => Promise<void>) => {
    setWorking(true);
    setError('');
    setMessage('');
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setWorking(false);
    }
  };
  const load = async () => {
    const data = await api<Venue[]>('/venues');
    setVenues(data.map((v) => ({ ...v, layout: layoutSchema.parse(v.layout) })));
    setVenueId((id) => id || data.find((v) => v.kind === 'restaurant')?.id || data[0]?.id || '');
    setLoaded(true);
  };
  useEffect(() => {
    load().catch((e) => {
      setError(e.message);
      setLoaded(true);
    });
    api('/auth/me')
      .then(() => setAdmin(true))
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!venueId) return;
    const controller = new AbortController();
    setShows([]);
    setShowId('');
    api<Show[]>(`/venues/${venueId}/shows`, { signal: controller.signal })
      .then((data) => {
        setShows(data);
        setShowId(data[0]?.id ?? '');
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setError(e.message);
      });
    return () => controller.abort();
  }, [venueId]);
  const timeStart = interval?.start,
    timeEnd = interval?.end;
  useEffect(() => {
    setAvailabilityReady(false);
    setBusy([]);
    if (!venueId || !timeStart || !timeEnd || (seatVenue && !showId)) return;
    const controller = new AbortController();
    const update = () =>
      api<{ busy: string[] }>(
        `/venues/${venueId}/availability?${new URLSearchParams({ start: timeStart, end: timeEnd })}`,
        { signal: controller.signal },
      )
        .then((data) => {
          setBusy(data.busy);
          setAvailabilityReady(true);
        })
        .catch((e) => {
          if (e.name !== 'AbortError') {
            setError(e.message);
            setAvailabilityReady(false);
          }
        });
    void update();
    const timer = setInterval(update, 15000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [venueId, timeStart, timeEnd, showId, refresh, venue?.kind]);
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);
  const chooseVenue = (id: string) => {
    if (dirty && !confirm('Discard unsaved layout changes?')) return;
    setPartySize(1);
    setSelectedSeats([]);
    setStep(admin ? 'place' : 'time');
    setConfirmation(null);
    setVenueId(id);
    setView('3d');
    setFloorIndex(0);
    setSelected('');
    setEditing(false);
    setDirty(false);
    setTab('map');
    setMessage('');
    setError('');
  };
  const updateLayout = (layout: Layout) => {
    if (!draft) return;
    setDraft({ ...draft, layout });
    setDirty(true);
  };
  const updateResource = (patch: Partial<Resource>) => {
    if (!draft) return;
    updateLayout({
      ...draft.layout,
      floors: draft.layout.floors.map((f, i) =>
        i === floorIndex
          ? {
              ...f,
              resources: f.resources.map((r) => (r.id === selected ? { ...r, ...patch } : r)),
            }
          : f,
      ),
    });
  };
  const moveResource = (id: string, x: number, y: number) => {
    if (!draft || !floor) return;
    const item = [...floor.resources, ...floor.objects].find((item) => item.id === id);
    if (!item) return;
    const angle = (item.rotation * Math.PI) / 180;
    const halfWidth =
      (Math.abs(item.width * Math.cos(angle)) + Math.abs(item.depth * Math.sin(angle))) / 2;
    const halfDepth =
      (Math.abs(item.width * Math.sin(angle)) + Math.abs(item.depth * Math.cos(angle))) / 2;
    x = Math.max(halfWidth, Math.min(floor.width - halfWidth, Math.round(x * 4) / 4));
    y = Math.max(halfDepth, Math.min(floor.depth - halfDepth, Math.round(y * 4) / 4));
    updateLayout({
      ...draft.layout,
      floors: draft.layout.floors.map((f, i) =>
        i === floorIndex
          ? {
              ...f,
              resources: f.resources.map((r) => (r.id === id ? { ...r, x, y } : r)),
              objects: (f.objects ?? []).map((o) => (o.id === id ? { ...o, x, y } : o)),
            }
          : f,
      ),
    });
    return { x, y };
  };
  const save = () =>
    run(async () => {
      if (!draft) return;
      const parsed = layoutSchema.parse(draft.layout);
      const result = await api<Venue>(
        `/venues/${draft.id}`,
        json({ layout: parsed, name: draft.name, revision: draft.revision }, 'PUT'),
      );
      setVenues((v) => v.map((x) => (x.id === result.id ? result : x)));
      setDraft(result);
      setDirty(false);
      setEditing(false);
      setMessage('Layout saved. Both views are up to date.');
    });
  const openCreate = (copy?: Venue) => {
    setSource(copy ?? null);
    setEmptyLayout(false);
    setKind(copy?.kind ?? 'restaurant');
    setNewName(copy ? `${copy.name} copy` : '');
    setModal('venue');
  };
  const createVenue = () =>
    run(async () => {
      const result = await api<Venue>(
        '/venues',
        json({ name: newName, kind, sourceId: source?.id, empty: emptyLayout }),
      );
      setVenues((v) => [...v, result]);
      chooseVenue(result.id);
      setModal(null);
      setMessage('Venue created from your template.');
    });
  const reserve = () =>
    run(async () => {
      if (!venue || !bookingResources.length || !interval || !canReserve) return;
      const booking = await api<Booking & { bookings?: Booking[] }>(
        '/bookings',
        json({
          venueId: venue.id,
          resourceId: bookingResources[0].id,
          ...(seatVenue ? { resourceIds: bookingResources.map((r) => r.id) } : {}),
          partySize,
          expectedTotal: total,
          expectedCurrency: currency,
          guestName: guest,
          ...(seatVenue ? { showId } : interval),
        }),
      ).catch(async (error) => {
        await load();
        setRefresh((v) => v + 1);
        throw error;
      });
      setConfirmation(booking);
      setStep('done');
      setRefresh((v) => v + 1);
      setGuest('');
      setMessage(
        `Reservation confirmed for ${bookingResources.map((r) => `${r.section ? `Block ${r.section} · ` : ''}${r.label}`).join(', ')}.`,
      );
    });
  const showBookings = () =>
    run(async () => {
      setBookings(await api<Booking[]>('/bookings'));
      setTab('bookings');
    });
  const exportLayout = () => {
    if (!current) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(current.layout, null, 2)], { type: 'application/json' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'openvenue-layout.json';
    a.click();
    URL.revokeObjectURL(url);
  };
  const importLayout = (file?: File) =>
    run(async () => {
      if (!file) return;
      if (file.size > 1000000) throw new Error('Layout file must be smaller than 1 MB');
      const layout = layoutSchema.parse(JSON.parse(await file.text()));
      updateLayout(cloneLayout(layout));
      setFloorIndex(0);
      setSelected('');
      setMessage('Layout imported. Save to apply changes.');
    });
  const addResource = () => {
    if (!draft || !floor || !venue) return;
    const type =
      venue.kind === 'restaurant' ? 'table' : venue.kind === 'parking' ? 'space' : 'seat';
    const r: Resource = {
      id: crypto.randomUUID(),
      kind: type,
      section: '',
      label: `${type === 'table' ? 'Table' : type === 'space' ? 'Space' : 'Seat'} ${floor.resources.length + 1}`,
      x: floor.width / 2,
      y: floor.depth / 2,
      width: type === 'space' ? 2.6 : type === 'table' ? 2 : 0.9,
      depth: type === 'space' ? 5 : type === 'table' ? 1.6 : 1,
      rotation: 0,
      shape: 'rectangle',
      color: '#985864',
      price: 0,
      elevation: 0,
      capacity: type === 'table' ? 4 : 1,
      accessible: false,
      ev: false,
    };
    updateLayout({
      ...draft.layout,
      floors: draft.layout.floors.map((f, i) =>
        i === floorIndex ? { ...f, resources: [...f.resources, r] } : f,
      ),
    });
    setSelected(r.id);
  };
  const timeFields = (
    <>
      {venue?.kind !== 'parking' && (
        <label>
          {seatVenue ? 'Number of seats' : 'Number of guests'}
          <select
            aria-label={seatVenue ? 'Number of seats' : 'Number of guests'}
            value={partySize}
            onChange={(e) => {
              setPartySize(Number(e.target.value));
              setSelected('');
              setSelectedSeats([]);
            }}
          >
            {Array.from({ length: seatVenue ? 20 : 50 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </select>
        </label>
      )}
      {seatVenue ? (
        <>
          <label>
            {venue?.kind === 'stadium' ? 'Event' : 'Showtime'}
            <select
              aria-label={venue?.kind === 'stadium' ? 'Event' : 'Showtime'}
              value={showId}
              onChange={(e) => setShowId(e.target.value)}
            >
              <option value="">Choose a show</option>
              {shows.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title} · {new Date(s.start).toLocaleString()}
                </option>
              ))}
            </select>
          </label>
          {shows.length === 0 && (
            <p className="muted">No upcoming shows. An administrator can add one.</p>
          )}
          {admin && (
            <button
              className="text-button"
              onClick={() => {
                setShowTitle('');
                setModal('show');
              }}
            >
              + {venue?.kind === 'stadium' ? 'Add event' : 'Add showtime'}
            </button>
          )}
        </>
      ) : (
        <>
          <label>
            Arriving
            <input
              aria-label="Arriving"
              type="datetime-local"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label>
            Leaving
            <input
              aria-label="Leaving"
              type="datetime-local"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
          {!interval && (
            <p className="field-error">Choose an end after the start, within seven days.</p>
          )}
        </>
      )}
    </>
  );
  const validTime =
    !!interval && Date.parse(interval.start) > Date.now() && (!seatVenue || !!showId);
  const canReserve =
    validTime &&
    availabilityReady &&
    bookingResources.length > 0 &&
    bookingResources.every((r) => !busy.includes(r.id)) &&
    (seatVenue
      ? bookingResources.length === partySize
      : !!resource && resource.capacity >= partySize);
  const confirmed = confirmation ? (confirmation.bookings ?? [confirmation]) : [];
  const directory = () => {
    if (dirty && !confirm('Discard unsaved layout changes?')) return;
    setEditing(false);
    setDirty(false);
    setTab('map');
    setStep('venues');
    setConfirmation(null);
    setMessage('');
  };
  return (
    <div className="shell" inert={working} aria-busy={working}>
      <aside className="sidebar">
        <a href="/" className="brand">
          <span className="brand-symbol">◈</span> openvenue<span className="beta">BETA</span>
        </a>
        <div className="workspace-label">YOUR WORKSPACE</div>
        <button className={`nav-item ${tab === 'map' ? 'active' : ''}`} onClick={directory}>
          <span>▦</span> Browse venues <span className="nav-count">{venues.length}</span>
        </button>
        {admin && (
          <button
            aria-label="Reservations"
            className={`nav-item ${tab === 'bookings' ? 'active' : ''}`}
            onClick={showBookings}
          >
            <span>▤</span> Reservations
          </button>
        )}
        <div className="sidebar-divider" />
        <div className="workspace-label">YOUR VENUES</div>
        <div className="venue-list">
          {venues.map((v) => (
            <button
              className={`venue-link ${venueId === v.id ? 'chosen' : ''}`}
              key={v.id}
              onClick={() => chooseVenue(v.id)}
            >
              <span>{types[v.kind].icon}</span>
              <span>
                {v.name}
                <small>{types[v.kind].name}</small>
              </span>
              {venueId === v.id && <span className="venue-dot" />}
            </button>
          ))}
        </div>
        {admin && (
          <button className="add-venue" aria-label="Add another venue" onClick={() => openCreate()}>
            + New venue
          </button>
        )}
        <div className="sidebar-bottom">
          <div className="open-source">
            <span>↗</span>
            <div>
              Made to be yours<small>Open source. Open possibilities.</small>
            </div>
          </div>
          <button
            className="profile"
            onClick={() =>
              admin
                ? run(async () => {
                    if (dirty && !confirm('Discard unsaved changes and sign out?')) return;
                    await api('/auth/logout', json({}));
                    setAdmin(false);
                    setEditing(false);
                    setDirty(false);
                    setTab('map');
                    setStep('venues');
                    setBookings([]);
                  })
                : openLogin()
            }
          >
            <span className="avatar">{admin ? 'AD' : 'G'}</span>
            <span>
              {admin ? 'Administrator' : 'Guest booking'}
              <small>{admin ? 'Sign out' : 'Admin sign in'}</small>
            </span>
            <span>↗</span>
          </button>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div>
            Workspace <span>/</span>{' '}
            {tab === 'bookings' ? 'Reservations' : admin ? 'Venue management' : 'Book a place'}
          </div>
          <div className="topbar-right">
            <span className="live-dot" /> Self-hosted workspace{' '}
            <span className="version">v0.1</span>
          </div>
        </header>
        <div className="content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {admin ? 'OPERATOR WORKSPACE' : 'RESERVE YOUR NEXT VISIT'}
              </div>
              <h1>
                {admin
                  ? 'Manage your venues'
                  : step === 'venues'
                    ? 'Where would you like to go?'
                    : step === 'done'
                      ? 'You’re booked.'
                      : 'Plan your visit'}
              </h1>
              <p>
                {admin
                  ? 'Set up spaces, edit layouts and manage guest reservations.'
                  : 'Choose a venue, find your place and reserve in a few steps.'}
              </p>
            </div>
            {admin ? (
              <button className="primary" onClick={() => openCreate()}>
                + New venue
              </button>
            ) : (
              <button className="secondary" onClick={openLogin}>
                Admin sign in
              </button>
            )}
          </div>
          {error && modal !== 'login' && (
            <div className="notice error" role="alert">
              {error}
              <button aria-label="Dismiss error" onClick={() => setError('')}>
                ×
              </button>
            </div>
          )}
          <div className={message ? 'notice success' : 'sr-only'} role="status" aria-live="polite">
            {message}
          </div>
          {tab === 'map' && !admin && step !== 'done' && (
            <nav className="booking-steps" aria-label="Booking progress">
              {(['venues', 'time', 'place', 'review'] as const).map((item, i) => (
                <span key={item} aria-current={step === item ? 'step' : undefined}>
                  {i + 1}. {['Venue', 'Time', 'Place', 'Review'][i]}
                </span>
              ))}
            </nav>
          )}
          {tab === 'bookings' ? (
            <section className="panel booking-list">
              <div className="panel-title">
                <h2>Reservations</h2>
                <span className="pill">{bookings.length} active</span>
              </div>
              <p className="muted">Upcoming and past confirmed reservations · Showing up to 500</p>
              {bookings.length === 0 ? (
                <div className="empty">No reservations yet. Your next guest starts on the map.</div>
              ) : (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Guest</th>
                        <th>Venue / resource</th>
                        <th>Party / price</th>
                        <th>When</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {bookings.map((b) => (
                        <tr key={b.id}>
                          <td>
                            {b.guestName}
                            <small className="booking-reference">{b.id}</small>
                          </td>
                          <td>
                            {b.venueName}
                            <small>{b.resourceLabel}</small>
                          </td>
                          <td>
                            {b.partySize} {b.partySize === 1 ? 'guest' : 'guests'}
                            <small>{formatPrice(b.price, b.currency)} · Not paid</small>
                          </td>
                          <td>
                            {new Date(b.start).toLocaleString()}
                            <small>to {new Date(b.end).toLocaleString()}</small>
                          </td>
                          <td>
                            <button
                              className="text-button danger"
                              aria-label="Cancel reservation"
                              disabled={working}
                              onClick={() =>
                                run(async () => {
                                  await api(`/bookings/${b.id}`, { method: 'DELETE' });
                                  setBookings((v) => v.filter((x) => x.id !== b.id));
                                  setRefresh((v) => v + 1);
                                  setMessage('Reservation cancelled.');
                                })
                              }
                            >
                              Cancel
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ) : step === 'venues' ? (
            <section aria-label="Venue directory">
              <div className="directory-filters" aria-label="Filter venues">
                {(['all', 'restaurant', 'parking', 'cinema', 'stadium'] as const).map((type) => (
                  <button
                    key={type}
                    className={filter === type ? 'primary' : 'secondary'}
                    aria-pressed={filter === type}
                    onClick={() => setFilter(type)}
                  >
                    {type === 'all' ? 'All venues' : types[type].name}
                  </button>
                ))}
              </div>
              <div className="venue-directory">
                {venues
                  .filter((v) => filter === 'all' || v.kind === filter)
                  .map((v) => (
                    <article className="panel directory-card" key={v.id}>
                      <div className={`venue-art ${v.kind}`} aria-hidden="true">
                        {types[v.kind].icon}
                      </div>
                      <div className="directory-details">
                        <div className="eyebrow">{types[v.kind].name}</div>
                        <h2>{v.name}</h2>
                        <p>
                          {v.layout.floors.reduce((n, f) => n + f.resources.length, 0)}{' '}
                          {v.kind === 'restaurant'
                            ? 'tables'
                            : v.kind === 'parking'
                              ? 'parking spaces'
                              : 'seats'}{' '}
                          · {v.layout.floors.length}{' '}
                          {v.layout.floors.length === 1 ? 'floor' : 'floors'}
                        </p>
                        <button className="primary full" onClick={() => chooseVenue(v.id)}>
                          {admin ? 'Manage' : 'Book'} {v.name} →
                        </button>
                      </div>
                    </article>
                  ))}
              </div>
              {loaded && !venues.some((v) => filter === 'all' || v.kind === filter) && (
                <p className="empty">No venues in this category yet.</p>
              )}
              {!loaded && <p className="empty">Loading venues…</p>}
            </section>
          ) : step === 'done' && confirmation ? (
            <section className="panel journey-panel" aria-label="Booking confirmation">
              <div className="confirmation-mark" aria-hidden="true">
                ✓
              </div>
              <h2>Reservation confirmed</h2>
              <p>Save these details for your arrival.</p>
              <dl className="booking-summary">
                <dt>Venue</dt>
                <dd>{venue?.name}</dd>
                <dt>Place</dt>
                <dd>
                  {confirmed
                    .map(
                      (b) =>
                        venue?.layout.floors
                          .flatMap((f) => f.resources)
                          .find((r) => r.id === b.resourceId)?.label,
                    )
                    .join(', ')}
                </dd>
                <dt>{seatVenue ? 'Seats' : 'Guests'}</dt>
                <dd>{seatVenue ? confirmed.length : confirmation.partySize}</dd>
                <dt>Total</dt>
                <dd>
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
              <button className="primary" onClick={directory}>
                Book another visit
              </button>
            </section>
          ) : !admin && step === 'time' && venue ? (
            <section className="panel journey-panel">
              <button className="text-button" onClick={directory}>
                ← All venues
              </button>
              <div className="eyebrow">{types[venue.kind].name}</div>
              <h2>{venue.name}</h2>
              <p>
                {seatVenue
                  ? 'Choose your screening before selecting a seat.'
                  : 'When will you visit? Availability is checked for the whole stay.'}
              </p>
              {timeFields}
              {interval && !validTime && !seatVenue && (
                <p className="field-error">Choose an arrival time in the future.</p>
              )}
              <p className="muted">Times are shown in your device’s local time zone.</p>
              {validTime && !availabilityReady && <p role="status">Checking availability…</p>}
              <button
                className="primary full"
                disabled={!validTime || !availabilityReady}
                onClick={() => {
                  setSelected('');
                  setSelectedSeats([]);
                  setStep('place');
                }}
              >
                Choose a place →
              </button>
            </section>
          ) : !current || !floor ? (
            <div className="empty">
              {loaded
                ? 'No venues found. Sign in to create your first venue.'
                : 'Opening your workspace…'}
            </div>
          ) : (
            <section
              className={`panel venue-panel ${editing ? 'layout-editor' : ''} ${!admin && step === 'review' ? 'review-panel' : ''}`}
            >
              <div className="panel-title">
                <div className="venue-heading">
                  <span className="venue-icon">{types[current.kind].icon}</span>
                  <div>
                    <h2>{current.name}</h2>
                    <p>
                      {types[current.kind].name} <span>·</span> {current.layout.floors.length}{' '}
                      {current.layout.floors.length === 1 ? 'floor' : 'floors'} <span>·</span>{' '}
                      {current.layout.floors.reduce((n, f) => n + f.resources.length, 0)} resources
                    </p>
                  </div>
                </div>
                <div className="panel-actions">
                  {admin && (
                    <>
                      <button className="text-button" onClick={() => openCreate(current)}>
                        Duplicate
                      </button>
                      <button className="secondary" onClick={() => setModal('generate')}>
                        Generate with Claude
                      </button>
                      {editing ? (
                        <>
                          <button
                            className="secondary"
                            onClick={() => {
                              if (!dirty || confirm('Discard unsaved changes?')) {
                                setEditing(false);
                                setDirty(false);
                              }
                            }}
                          >
                            {dirty ? 'Discard changes' : 'Done editing'}
                          </button>
                          <button className="primary" disabled={working || !dirty} onClick={save}>
                            Save layout
                          </button>
                        </>
                      ) : (
                        <button
                          className="secondary"
                          onClick={() => {
                            setDraft(structuredClone(venue!));
                            setEditing(true);
                            setView('2d');
                          }}
                        >
                          Edit layout
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
              {!admin && (
                <div className="visit-summary">
                  <button className="text-button" onClick={() => setStep('time')}>
                    ← Change time
                  </button>
                  <span>
                    {activeShow?.title}
                    {interval &&
                      ` · ${new Date(interval.start).toLocaleString()} – ${new Date(interval.end).toLocaleString()}`}
                  </span>
                </div>
              )}
              <div className="map-toolbar">
                <label className="floor-control">
                  Floor
                  <select
                    aria-label="Floor"
                    value={floorIndex}
                    onChange={(e) => {
                      setFloorIndex(Number(e.target.value));
                      setSelected('');
                    }}
                  >
                    {current.layout.floors.map((f, i) => (
                      <option key={f.id} value={i}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="legend">
                  <span>
                    <i className="available" />
                    Available
                  </span>
                  <span>
                    <i className="reserved" />
                    Reserved
                  </span>
                  <span>
                    <i className="selected" />
                    Selected
                  </span>
                </div>
                <div className="view-toggle">
                  <button
                    className={view === '2d' ? 'active' : ''}
                    aria-label="2D view"
                    aria-pressed={view === '2d'}
                    onClick={() => setView('2d')}
                  >
                    ▦ 2D
                  </button>
                  <button
                    className={view === '3d' ? 'active' : ''}
                    aria-label="3D view"
                    aria-pressed={view === '3d'}
                    onClick={() => setView('3d')}
                  >
                    ◇ 3D
                  </button>
                </div>
              </div>
              <div className="map-body">
                <div className="map-column">
                  {view === '2d' ? (
                    <Map2D
                      key={floor.id}
                      floor={floor}
                      kind={current.kind}
                      selected={selected}
                      selectedIds={editing ? [] : selectedSeats}
                      busy={busy}
                      editing={editing}
                      onSelect={selectPlace}
                      onMove={moveResource}
                    />
                  ) : (
                    <SceneBoundary key={floor.id}>
                      <Suspense fallback={<div className="empty">Preparing your 3D space…</div>}>
                        <Map3D
                          key={floor.id}
                          floor={floor}
                          kind={current.kind}
                          selected={selected}
                          selectedIds={editing ? [] : selectedSeats}
                          busy={busy}
                          onSelect={selectPlace}
                          editing={editing}
                          onMove={moveResource}
                        />
                      </Suspense>
                    </SceneBoundary>
                  )}
                  <div className="map-footer">
                    <span>
                      <i className="live-dot" />
                      {editing
                        ? 'Editing layout'
                        : availabilityReady
                          ? `${floor.resources.filter((r) => !busy.includes(r.id)).length} of ${floor.resources.length} available`
                          : 'Choose a valid time to check availability'}
                    </span>
                    <span>
                      {editing
                        ? dirty
                          ? 'Unsaved changes'
                          : 'Layout is up to date'
                        : 'Availability refreshes every 15 seconds'}
                    </span>
                  </div>
                </div>
                <aside className="inspector">
                  {editing ? (
                    <LayoutInspector
                      view={view}
                      draft={draft!}
                      floor={floor}
                      floorIndex={floorIndex}
                      resource={resource}
                      selected={selected}
                      updateLayout={updateLayout}
                      setFloorIndex={setFloorIndex}
                      setSelected={setSelected}
                      updateResource={updateResource}
                      addResource={addResource}
                      exportLayout={exportLayout}
                      importLayout={importLayout}
                    />
                  ) : (
                    <>
                      <div className="eyebrow">
                        {step === 'review' ? 'FINAL STEP' : 'SELECT YOUR PLACE'}
                      </div>
                      <h3>
                        {step === 'review' ? 'Review your reservation' : 'Choose an available spot'}
                      </h3>
                      <p className="muted">
                        {step === 'review'
                          ? 'Check your selection and enter the name for your reservation.'
                          : 'Explore the map or choose from the list below.'}
                      </p>
                      {admin && timeFields}
                      {!admin && step === 'review' && (
                        <p>
                          <strong>{floor.name}</strong>
                          <br />
                          {activeShow?.title}
                        </p>
                      )}
                      <div
                        className={`selection-card ${bookingResources.length ? 'has-selection' : ''}`}
                      >
                        <span className="selection-symbol">
                          {resource ? types[current.kind].icon : '⌖'}
                        </span>
                        <strong>
                          {bookingResources.length
                            ? bookingResources
                                .map((r) => `${r.section ? `Block ${r.section} · ` : ''}${r.label}`)
                                .join(', ')
                            : 'Your spot is waiting'}
                        </strong>
                        <small>
                          {seatVenue
                            ? `${bookingResources.length} seats selected`
                            : resource
                              ? `${resource.kind === 'table' ? `${resource.capacity} guests` : '1 place'}${resource.accessible ? ' · Accessible' : ''}${resource.ev ? ' · EV charging' : ''}`
                              : 'Select a resource on the map'}
                        </small>
                        {resource && busy.includes(resource.id) && (
                          <span className="reserved-label">Reserved for this time</span>
                        )}
                      </div>
                      {seatVenue && bookingResources.some((r) => busy.includes(r.id)) && (
                        <p className="field-error">
                          A selected seat is no longer available. Remove it and choose another.
                        </p>
                      )}
                      {seatVenue && step !== 'review' && (
                        <div className="seat-chips">
                          {bookingResources.map((r) => (
                            <button
                              className="secondary"
                              key={r.id}
                              onClick={() => selectPlace(r.id)}
                              aria-label={`Remove ${r.label}`}
                            >
                              {r.label} ×
                            </button>
                          ))}
                        </div>
                      )}
                      {seatVenue && (
                        <p>
                          {selectedSeats.length} of {partySize} seats selected. Select a chosen seat
                          again to remove it.
                        </p>
                      )}
                      {!seatVenue && venue?.kind === 'restaurant' && (
                        <p>
                          {partySize} {partySize === 1 ? 'guest' : 'guests'} · Choose a table with
                          enough seats.
                        </p>
                      )}
                      {!seatVenue && resource && resource.capacity < partySize && (
                        <p className="field-error">
                          This table seats {resource.capacity}. Choose a larger table or change your
                          party size.
                        </p>
                      )}
                      {bookingResources.length > 0 && (
                        <div className="price-summary" aria-label="Reservation price summary">
                          {bookingResources.map((r) => (
                            <p key={r.id}>
                              {r.label}
                              <strong>
                                {formatPrice(reservationPrice(venue!.layout, r), currency)}
                              </strong>
                            </p>
                          ))}
                          <p>
                            Total<strong>{formatPrice(total, currency)}</strong>
                          </p>
                          <small>For the entire reservation. Payment is not collected here.</small>
                        </div>
                      )}
                      {(admin || step !== 'review') && (view === '3d' || !admin) && (
                        <label>
                          Resource
                          <select
                            value={
                              seatVenue
                                ? (selectedSeats
                                    .filter((id) => floor.resources.some((r) => r.id === id))
                                    .at(-1) ?? '')
                                : selected
                            }
                            onChange={(e) => selectPlace(e.target.value)}
                          >
                            <option value="">Select a resource</option>
                            {floor.resources.map((r) => (
                              <option
                                key={r.id}
                                value={r.id}
                                disabled={
                                  busy.includes(r.id) || (!seatVenue && r.capacity < partySize)
                                }
                              >
                                {r.label}
                                {r.section ? ` · Block ${r.section}` : ''}
                                {selectedSeats.includes(r.id) ? ' · Selected' : ''}
                                {venue?.layout.pricing.mode !== 'free'
                                  ? ` · ${formatPrice(reservationPrice(venue!.layout, r), currency)}`
                                  : ''}
                                {busy.includes(r.id) ? ' · Reserved' : ''}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      {!admin && step === 'place' ? (
                        <button
                          className="primary full"
                          disabled={!canReserve}
                          onClick={() => setStep('review')}
                        >
                          Review reservation →
                        </button>
                      ) : (
                        <>
                          {!admin && (
                            <button className="text-button" onClick={() => setStep('place')}>
                              ← Change place
                            </button>
                          )}
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              void reserve();
                            }}
                          >
                            <label>
                              Guest name
                              <input
                                autoComplete="name"
                                value={guest}
                                maxLength={100}
                                required
                                onChange={(e) => setGuest(e.target.value)}
                                placeholder="Who are we expecting?"
                              />
                            </label>
                            <button className="primary full" disabled={working || !canReserve}>
                              Confirm reservation <span>↗</span>
                            </button>
                          </form>
                        </>
                      )}
                      <p className="privacy-note">
                        Your details are visible only to the venue administrator.
                      </p>
                    </>
                  )}
                </aside>
              </div>
            </section>
          )}
          <footer className="page-footer">
            <span>Thoughtfully mapped. Effortlessly reserved.</span>
            <span>OpenVenue · Built for shared spaces</span>
          </footer>
        </div>
      </main>
      {modal === 'generate' && current && (
        <GenerateSceneDialog
          venueId={current.id}
          kind={current.kind}
          onClose={() => setModal(null)}
          onApply={(layout) => {
            setDraft({ ...current, layout });
            setEditing(true);
            setDirty(true);
            setFloorIndex(0);
            setSelected('');
            setSelectedSeats([]);
            setView('3d');
            setModal(null);
            setMessage(
              'Generated scene added to your draft. Review it, then Save layout to publish.',
            );
          }}
        />
      )}
      {modal === 'login' && (
        <Modal title="Admin sign in" onClose={closeLogin}>
          <p className="muted">Sign in to manage venues, layouts and reservations.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await api('/auth/login', json({ password }));
                setAdmin(true);
                closeLogin();
                setTab('map');
                setStep('place');
                setMessage('Signed in as administrator.');
              });
            }}
          >
            <label>
              Password
              <input
                type={showPassword ? 'text' : 'password'}
                data-autofocus
                aria-describedby="admin-password-help"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            <button
              type="button"
              className="text-button"
              aria-pressed={showPassword}
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? 'Hide password' : 'Show password'}
            </button>
            <p id="admin-password-help" className="muted">
              Use the admin password supplied by your workspace owner. No account registration is
              needed.
            </p>
            {error && (
              <p className="field-error" role="alert">
                {error}
              </p>
            )}
            <button className="primary full" disabled={working}>
              {working ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </Modal>
      )}
      {modal === 'venue' && (
        <Modal
          title={source ? 'Duplicate venue' : 'Start with a space'}
          onClose={() => setModal(null)}
        >
          <p className="muted">A ready-to-edit template. Yours to make your own.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void createVenue();
            }}
          >
            <label>
              Venue name
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                required
                maxLength={100}
                placeholder="e.g. Riverside Kitchen"
              />
            </label>
            <label>
              Template
              <select
                value={kind}
                disabled={!!source}
                onChange={(e) => setKind(e.target.value as VenueKind)}
              >
                {Object.entries(types).map(([key, t]) => (
                  <option key={key} value={key}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            {!source && (
              <label>
                Starting layout
                <select
                  value={emptyLayout ? 'empty' : 'template'}
                  onChange={(e) => setEmptyLayout(e.target.value === 'empty')}
                >
                  <option value="template">Seeded template · customize everything</option>
                  <option value="empty">Empty scene · build from scratch</option>
                </select>
              </label>
            )}
            <div className="template-preview">
              <span>{types[kind].icon}</span>
              <strong>{types[kind].name}</strong>
              <p>
                {kind === 'restaurant'
                  ? 'Bistro · dining, cocktail bar & lounge'
                  : kind === 'parking'
                    ? 'Garage · 2 levels, EV bays, ramp & security'
                    : kind === 'stadium'
                      ? 'Stadium · 984 seats, rising stands & editable pitch'
                      : 'Cinema · 48 seats, foyer & concessions'}
              </p>
            </div>
            {error && <p className="field-error">{error}</p>}
            <button className="primary full" disabled={working}>
              Create venue
            </button>
          </form>
        </Modal>
      )}
      {modal === 'show' && (
        <Modal title="Add a showtime" onClose={() => setModal(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                if (!interval) throw new Error('Choose a valid time interval');
                const show = await api<Show>(
                  `/venues/${venueId}/shows`,
                  json({
                    title: showTitle,
                    start: new Date(start).toISOString(),
                    end: new Date(end).toISOString(),
                  }),
                );
                setShows((s) => [...s, show]);
                setShowId(show.id);
                setModal(null);
                setMessage('Showtime added.');
              });
            }}
          >
            <label>
              Show title
              <input
                value={showTitle}
                onChange={(e) => setShowTitle(e.target.value)}
                required
                maxLength={100}
              />
            </label>
            <label>
              Starts
              <input
                type="datetime-local"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                required
              />
            </label>
            <label>
              Ends
              <input
                type="datetime-local"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                required
              />
            </label>
            {error && <p className="field-error">{error}</p>}
            <button className="primary full" disabled={working}>
              Add showtime
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
