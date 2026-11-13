import { Modal } from './Modal';
import { SceneBoundary } from './SceneBoundary';
import { LayoutInspector } from './LayoutInspector';
import { Suspense, lazy, useEffect, useState } from 'react';
import {
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
  cinema: { icon: '▥', name: 'Cinema', description: 'Every seat has a story' },
};
export default function App() {
  const [venues, setVenues] = useState<Venue[]>([]),
    [venueId, setVenueId] = useState(''),
    [draft, setDraft] = useState<Venue | null>(null);
  const [floorIndex, setFloorIndex] = useState(0),
    [selected, setSelected] = useState(''),
    [view, setView] = useState<'2d' | '3d'>('2d');
  const [admin, setAdmin] = useState(false),
    [editing, setEditing] = useState(false),
    [dirty, setDirty] = useState(false),
    [tab, setTab] = useState<'map' | 'bookings'>('map');
  const [modal, setModal] = useState<'login' | 'venue' | 'show' | null>(null),
    [source, setSource] = useState<Venue | null>(null);
  const [kind, setKind] = useState<VenueKind>('restaurant'),
    [newName, setNewName] = useState(''),
    [password, setPassword] = useState('');
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
  const activeShow = shows.find((s) => s.id === showId);
  const timeResult = intervalSchema.safeParse({
    start:
      activeShow && venue?.kind === 'cinema'
        ? activeShow.start
        : start && Number.isFinite(Date.parse(start))
          ? new Date(start).toISOString()
          : '',
    end:
      activeShow && venue?.kind === 'cinema'
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
    setVenues(data);
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
    if (!venueId || !timeStart || !timeEnd || (venue?.kind === 'cinema' && !showId)) return;
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
    setVenueId(id);
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
    if (!draft) return;
    updateLayout({
      ...draft.layout,
      floors: draft.layout.floors.map((f, i) =>
        i === floorIndex
          ? { ...f, resources: f.resources.map((r) => (r.id === id ? { ...r, x, y } : r)) }
          : f,
      ),
    });
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
    setKind(copy?.kind ?? 'restaurant');
    setNewName(copy ? `${copy.name} copy` : '');
    setModal('venue');
  };
  const createVenue = () =>
    run(async () => {
      const result = await api<Venue>(
        '/venues',
        json({ name: newName, kind, sourceId: source?.id }),
      );
      setVenues((v) => [...v, result]);
      chooseVenue(result.id);
      setModal(null);
      setMessage('Venue created from your template.');
    });
  const reserve = () =>
    run(async () => {
      if (!venue || !resource || !interval) return;
      await api(
        '/bookings',
        json({
          venueId: venue.id,
          resourceId: resource.id,
          guestName: guest,
          ...(venue.kind === 'cinema' ? { showId } : interval),
        }),
      );
      setRefresh((v) => v + 1);
      setGuest('');
      setMessage(`Reservation confirmed for ${resource.label}.`);
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
      label: `${type === 'table' ? 'Table' : type === 'space' ? 'Space' : 'Seat'} ${floor.resources.length + 1}`,
      x: floor.width / 2,
      y: floor.depth / 2,
      width: type === 'space' ? 2.6 : type === 'table' ? 2 : 0.9,
      depth: type === 'space' ? 5 : type === 'table' ? 1.6 : 1,
      rotation: 0,
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
  return (
    <div className="shell">
      <aside className="sidebar">
        <a href="/" className="brand">
          <span className="brand-symbol">◈</span> openvenue<span className="beta">BETA</span>
        </a>
        <div className="workspace-label">YOUR WORKSPACE</div>
        <button
          className={`nav-item ${tab === 'map' ? 'active' : ''}`}
          onClick={() => setTab('map')}
        >
          <span>▦</span> Venue explorer <span className="nav-count">{venues.length}</span>
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
                    setBookings([]);
                  })
                : setModal('login')
            }
          >
            <span className="avatar">{admin ? 'AD' : 'G'}</span>
            <span>
              {admin ? 'Administrator' : 'Guest workspace'}
              <small>{admin ? 'Sign out' : 'Admin sign in'}</small>
            </span>
            <span>↗</span>
          </button>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div>
            Workspace <span>/</span> {tab === 'map' ? 'Venue explorer' : 'Reservations'}
          </div>
          <div className="topbar-right">
            <span className="live-dot" /> Self-hosted workspace{' '}
            <span className="version">v0.1</span>
          </div>
        </header>
        <div className="content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">A LITTLE SPACE. ENDLESS POSSIBILITIES.</div>
              <h1>Your spaces, connected.</h1>
              <p>Plan the layout. Find the right spot. Make room for everyone.</p>
            </div>
            {admin ? (
              <button className="primary" onClick={() => openCreate()}>
                + New venue
              </button>
            ) : (
              <button className="secondary" onClick={() => setModal('login')}>
                Admin sign in
              </button>
            )}
          </div>
          {error && (
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
          <section className="template-cards" aria-label="Venue types">
            {(Object.entries(types) as [VenueKind, (typeof types)[VenueKind]][]).map(([key, t]) => (
              <button
                key={key}
                className={`template-card ${venue?.kind === key ? 'selected-template' : ''}`}
                onClick={() => {
                  const match = venues.find((v) => v.kind === key);
                  if (match) chooseVenue(match.id);
                }}
              >
                <span className={`template-icon ${key}`}>{t.icon}</span>
                <span>
                  <strong>{t.name}</strong>
                  <small>{t.description}</small>
                </span>
                <span className="card-arrow">↗</span>
              </button>
            ))}
          </section>
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
                        <th>When</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {bookings.map((b) => (
                        <tr key={b.id}>
                          <td>{b.guestName}</td>
                          <td>
                            {b.venueName}
                            <small>{b.resourceLabel}</small>
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
          ) : !current || !floor ? (
            <div className="empty">
              {loaded
                ? 'No venues found. Sign in to create your first venue.'
                : 'Opening your workspace…'}
            </div>
          ) : (
            <section className="panel venue-panel">
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
                            Discard
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
                      busy={busy}
                      editing={editing}
                      onSelect={setSelected}
                      onMove={moveResource}
                    />
                  ) : (
                    <SceneBoundary key={floor.id}>
                      <Suspense fallback={<div className="empty">Preparing your 3D space…</div>}>
                        <Map3D
                          floor={floor}
                          kind={current.kind}
                          selected={selected}
                          busy={busy}
                          onSelect={setSelected}
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
                      <div className="eyebrow">FIND YOUR PLACE</div>
                      <h3>A spot just for you.</h3>
                      <p className="muted">Pick your time, then choose a spot on the map.</p>
                      {current.kind === 'cinema' ? (
                        <>
                          <label>
                            Showtime
                            <select
                              aria-label="Showtime"
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
                            <p className="muted">
                              No upcoming shows. An administrator can add one.
                            </p>
                          )}
                          {admin && (
                            <button
                              className="text-button"
                              onClick={() => {
                                setShowTitle('');
                                setModal('show');
                              }}
                            >
                              + Add showtime
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
                            <p className="field-error">
                              Choose an end after the start, within seven days.
                            </p>
                          )}
                        </>
                      )}
                      <div className={`selection-card ${resource ? 'has-selection' : ''}`}>
                        <span className="selection-symbol">
                          {resource ? types[current.kind].icon : '⌖'}
                        </span>
                        <strong>{resource ? resource.label : 'Your spot is waiting'}</strong>
                        <small>
                          {resource
                            ? `${resource.kind === 'table' ? `${resource.capacity} guests` : '1 place'}${resource.accessible ? ' · Accessible' : ''}${resource.ev ? ' · EV charging' : ''}`
                            : 'Select a resource on the map'}
                        </small>
                        {resource && busy.includes(resource.id) && (
                          <span className="reserved-label">Reserved for this time</span>
                        )}
                      </div>
                      {view === '3d' && (
                        <label>
                          Resource
                          <select value={selected} onChange={(e) => setSelected(e.target.value)}>
                            <option value="">Select a resource</option>
                            {floor.resources.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.label}
                                {busy.includes(r.id) ? ' · Reserved' : ''}
                              </option>
                            ))}
                          </select>
                        </label>
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
                        <button
                          className="primary full"
                          disabled={
                            working ||
                            !resource ||
                            !availabilityReady ||
                            busy.includes(selected) ||
                            !interval ||
                            (current.kind === 'cinema' && !showId)
                          }
                        >
                          Confirm reservation <span>↗</span>
                        </button>
                      </form>
                      <p className="privacy-note">
                        No payment required. Your details are visible only to the venue
                        administrator.
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
      {modal === 'login' && (
        <Modal title="Welcome back" onClose={() => setModal(null)}>
          <p className="muted">Sign in to manage venues, layouts and reservations.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await api('/auth/login', json({ password }));
                setAdmin(true);
                setPassword('');
                setModal(null);
                setMessage('Signed in as administrator.');
              });
            }}
          >
            <label>
              Password
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            {error && <p className="field-error">{error}</p>}
            <button className="primary full" disabled={working}>
              Sign in
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
            <div className="template-preview">
              <span>{types[kind].icon}</span>
              <strong>{types[kind].name}</strong>
              <p>
                {kind === 'restaurant'
                  ? '12 tables · 40 guests · 1 dining room'
                  : kind === 'parking'
                    ? '32 spaces · 2 floors · EV & accessible spaces'
                    : '48 seats · 6 rows · 1 screen'}
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
