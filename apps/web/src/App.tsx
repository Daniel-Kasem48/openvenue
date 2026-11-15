import { EventPricingCard } from './EventPricingCard';
import { BookingConfirmation } from './booking/BookingConfirmation';
import { BookingProgress, type BookingStep } from './booking/BookingProgress';
import { BookingEmbed } from './booking/BookingEmbed';
import type { PublicBookingRoute } from './booking/publicRoute';
import { reserveBooking } from './booking/reserve';
import { VenueSettings } from './VenueSettings';
import { Menu } from './Menu';
import { LayoutThumbnail } from './LayoutThumbnail';
import { assignTier, scopedResourceIds } from './priceTiers';
import {
  UtensilsCrossed,
  SquareParking,
  Clapperboard,
  Trophy,
  Layers,
  LayoutGrid,
  CalendarCheck,
  ArrowUpRight,
  Map,
  Box,
  MapPin,
  X,
} from 'lucide-react';
import { Team } from './Team';
import { Reservations } from './Reservations';
import { Events } from './Events';
import { Overview } from './Overview';
import { EventSeatControls } from './EventSeatControls';
import { Modal } from './Modal';
import { SceneBoundary } from './SceneBoundary';
import { GenerateSceneDialog } from './GenerateSceneDialog';
import { LayoutInspector } from './LayoutInspector';
import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import {
  publicConfigSchema,
  reservationPrice,
  seatLocation,
  formatPrice,
  cloneLayout,
  intervalSchema,
  layoutSchema,
  type Session,
  type Booking,
  type ManagedEvent,
  type Layout,
  type Resource,
  type Show,
  type Venue,
  type VenueKind,
} from '@openvenue/contracts';
import { api, json, localTime } from './api';
import Map2D from './Map2D';
const Map3D = lazy(() => import('./Map3D'));
const types: Record<
  VenueKind,
  { icon: import('react').ReactNode; name: string; description: string }
> = {
  restaurant: {
    icon: <UtensilsCrossed className="size-5" aria-hidden="true" strokeWidth={1.75} />,
    name: 'Restaurant',
    description: 'Tables, chairs & good company',
  },
  parking: {
    icon: <SquareParking className="size-5" aria-hidden="true" strokeWidth={1.75} />,
    name: 'Parking',
    description: 'A place for every arrival',
  },
  stadium: {
    icon: <Trophy className="size-5" aria-hidden="true" strokeWidth={1.75} />,
    name: 'Stadium',
    description: 'Sections, rows & match days',
  },
  cinema: {
    icon: <Clapperboard className="size-5" aria-hidden="true" strokeWidth={1.75} />,
    name: 'Cinema',
    description: 'Every seat has a story',
  },
};
export default function App({ publicBooking }: { publicBooking?: PublicBookingRoute }) {
  const [step, setStep] = useState<BookingStep>(publicBooking ? 'time' : 'venues');
  const [publicError, setPublicError] = useState(publicBooking?.error ?? '');
  const [embedUrl, setEmbedUrl] = useState('');
  const [confirmation, setConfirmation] = useState<(Booking & { bookings?: Booking[] }) | null>(
    null,
  );
  const [emptyLayout, setEmptyLayout] = useState(false);
  const [partySize, setPartySize] = useState(1);
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);
  const [filter, setFilter] = useState<VenueKind | 'all'>('all');
  const [venues, setVenues] = useState<Venue[]>([]),
    [venueId, setVenueId] = useState(publicBooking?.venueId ?? ''),
    [draft, setDraft] = useState<Venue | null>(null);
  const [venueSearch, setVenueSearch] = useState('');
  const selectedVenueButton = useRef<HTMLButtonElement>(null);
  useEffect(() => setVenueSearch(''), [venueId]);
  useEffect(() => {
    selectedVenueButton.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [venueId, venueSearch]);
  const [floorIndex, setFloorIndex] = useState(0),
    [selected, setSelected] = useState(''),
    [view, setView] = useState<'2d' | '3d'>('3d');
  const [session, setSession] = useState<Session | null>(null);
  const admin = !publicBooking && !!session && session.role !== 'staff';
  const [editing, setEditing] = useState(false),
    [dirty, setDirty] = useState(false),
    [tab, setTab] = useState<'map' | 'bookings' | 'overview' | 'team'>('map');
  const [modal, setModal] = useState<'login' | 'venue' | 'show' | 'generate' | 'settings' | null>(
      null,
    ),
    [source, setSource] = useState<Venue | null>(null);
  const [kind, setKind] = useState<VenueKind>('restaurant'),
    [newName, setNewName] = useState(''),
    [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const openLogin = () => {
    setError('');
    setPassword('');
    setEmail('');
    setShowPassword(false);
    setModal('login');
  };
  const closeLogin = () => {
    setPassword('');
    setEmail('');
    setShowPassword(false);
    setError('');
    setModal(null);
  };
  const [start, setStart] = useState(() => localTime(new Date(Date.now() + 3600000))),
    [end, setEnd] = useState(() => localTime(new Date(Date.now() + 7200000)));
  const [shows, setShows] = useState<Show[]>([]),
    [showId, setShowId] = useState(''),
    [showTitle, setShowTitle] = useState('');
  const [venueTab, setVenueTab] = useState<'map' | 'events'>('map');
  const [eventsRevision, setEventsRevision] = useState(0);
  const [editingShow, setEditingShow] = useState<Show | null>(null);
  const [showStart, setShowStart] = useState('');
  const [showEnd, setShowEnd] = useState('');
  const [overviewEvent, setOverviewEvent] = useState('');
  useEffect(() => {
    if (overviewEvent && shows.some((show) => show.id === overviewEvent)) {
      setShowId(overviewEvent);
      setManagingSeats(true);
      setOverviewEvent('');
    }
  }, [shows, overviewEvent]);
  const [blocked, setBlocked] = useState<string[]>([]);
  const [managingSeats, setManagingSeats] = useState(false);
  const [managedIds, setManagedIds] = useState<string[]>([]);
  const [paintTier, setPaintTier] = useState<string | null>(null);
  const [colourByPrice, setColourByPrice] = useState(false);
  useEffect(() => {
    setPaintTier(null);
    setColourByPrice(false);
  }, [venueId, editing, admin]);
  const [selectionScope, setSelectionScope] = useState<'seat' | 'row' | 'block'>('seat');
  useEffect(() => {
    setManagedIds([]);
  }, [venueId, showId, floorIndex, managingSeats]);
  useEffect(() => {
    setManagingSeats(false);
  }, [venueId, editing, admin]);
  const [busy, setBusy] = useState<string[]>([]),
    [availabilityLoaded, setAvailabilityReady] = useState(false),
    [guest, setGuest] = useState('');
  const [guestEmail, setGuestEmail] = useState(''),
    [guestPhone, setGuestPhone] = useState('');
  const [priceQuote, setPriceQuote] = useState<{
    key: string;
    prices: Record<string, number>;
    currency: Venue['layout']['pricing']['currency'];
  } | null>(null);
  const [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [working, setWorking] = useState(false),
    [loaded, setLoaded] = useState(false),
    [refresh, setRefresh] = useState(0);
  const venue = venues.find((v) => v.id === venueId),
    current = editing && draft ? draft : venue,
    floor = current?.layout.floors[floorIndex],
    resource = floor?.resources.find((r) => r.id === selected);
  const painting =
    admin && editing && current?.layout.pricing.mode === 'tiers' && paintTier !== null;
  const priceColors: Record<string, string> | undefined =
    colourByPrice && current?.layout.pricing.mode === 'tiers'
      ? Object.fromEntries(
          (floor?.resources ?? []).flatMap((resource) => {
            const tier = current.layout.pricing.tiers?.find((tier) => tier.id === resource.tierId);
            return tier ? [[resource.id, tier.color]] : [];
          }),
        )
      : undefined;
  const seatVenue = venue?.kind === 'cinema' || venue?.kind === 'stadium';
  const bookingResources = seatVenue
    ? (venue?.layout.floors
        .flatMap((f) => f.resources)
        .filter((r) => selectedSeats.includes(r.id)) ?? [])
    : resource
      ? [resource]
      : [];
  useEffect(() => {
    const ids = new Set(venue?.layout.floors.flatMap((f) => f.resources.map((r) => r.id)) ?? []);
    setSelectedSeats((current) => current.filter((id) => ids.has(id)));
  }, [venue]);
  const selectPlace = (id: string) => {
    if (admin && (managingSeats || painting) && floor) {
      const ids = scopedResourceIds(floor, id, selectionScope);
      if (!ids.length) {
        setError('This seat needs a block or row label before group selection.');
        return;
      }
      if (painting && draft) {
        updateLayout(assignTier(draft.layout, ids, paintTier!));
        return;
      }
      setManagedIds((previous) =>
        ids.every((id) => previous.includes(id))
          ? previous.filter((id) => !ids.includes(id))
          : [...new Set([...previous, ...ids])],
      );
      return;
    }
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
  const quoteKey = JSON.stringify([
    venueId,
    showId,
    interval?.start,
    interval?.end,
    venue?.revision,
    refresh,
  ]);
  const availabilityReady = availabilityLoaded && priceQuote?.key === quoteKey;
  const quotedPrice = (resource: Resource) =>
    (priceQuote?.key === quoteKey ? priceQuote.prices[resource.id] : undefined) ??
    (venue ? reservationPrice(venue.layout, resource) : 0);
  const total = bookingResources.reduce((sum, resource) => sum + quotedPrice(resource), 0);
  const currency =
    (priceQuote?.key === quoteKey ? priceQuote.currency : undefined) ??
    venue?.layout.pricing.currency ??
    'USD';
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
  const load = async (signal?: AbortSignal) => {
    if (publicBooking?.error) return;
    const data = await api<Venue[]>(admin ? '/venues?includeArchived=1' : '/venues', { signal });
    setVenues(data.map((v) => ({ ...v, layout: layoutSchema.parse(v.layout) })));
    if (publicBooking) {
      const requested = data.find((v) => v.id === publicBooking.venueId && !v.archivedAt);
      if (!requested) setPublicError('This venue is unavailable or archived.');
      else if (publicBooking.showId && !['cinema', 'stadium'].includes(requested.kind))
        setPublicError('This event is not available for this venue.');
    } else
      setVenueId((id) =>
        data.some((v) => v.id === id && !v.archivedAt)
          ? id
          : data.find((v) => !v.archivedAt && v.kind === 'restaurant')?.id ||
            data.find((v) => !v.archivedAt)?.id ||
            '',
      );
    setLoaded(true);
  };
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal).catch((e) => {
      if (e.name !== 'AbortError') {
        if (publicBooking) setPublicError(e.message);
        setError(e.message);
        setLoaded(true);
      }
    });
    return () => controller.abort();
  }, [admin]);
  const refreshSession = async () => {
    try {
      const currentSession = await api<Session>('/auth/me');
      setSession(currentSession);
      if (currentSession.role !== 'owner') setTab('overview');
    } catch {
      await api('/auth/logout', json({})).catch(() => {});
      setSession(null);
      setTab('map');
      setStep('venues');
    }
  };
  const signOut = () =>
    run(async () => {
      if (dirty && !confirm('Discard unsaved changes and sign out?')) return;
      await api('/auth/logout', json({}));
      setSession(null);
      setEditing(false);
      setDirty(false);
      setTab('map');
      setStep('venues');
    });
  useEffect(() => {
    if (publicBooking) return;
    api<Session>('/auth/me')
      .then((session) => {
        setSession(session);
        setTab('overview');
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!venueId || publicBooking?.error) return;
    const controller = new AbortController();
    setShows([]);
    setShowId('');
    api<Show[]>(`/venues/${venueId}/shows`, { signal: controller.signal })
      .then((data) => {
        setShows(data);
        if (publicBooking?.showId && !data.some((show) => show.id === publicBooking.showId))
          setPublicError('This event is unavailable or does not belong to this venue.');
        setShowId(publicBooking?.showId ?? data[0]?.id ?? '');
      })
      .catch((e) => {
        if (e.name !== 'AbortError') {
          if (publicBooking) setPublicError(e.message);
          setError(e.message);
        }
      });
    return () => controller.abort();
  }, [venueId]);
  const timeStart = interval?.start,
    timeEnd = interval?.end;
  useEffect(() => {
    setAvailabilityReady(false);
    setPriceQuote(null);
    setBusy([]);
    setBlocked([]);
    if (!venueId || !timeStart || !timeEnd || (seatVenue && !showId)) return;
    const controller = new AbortController();
    const update = () =>
      api<{
        busy: string[];
        blocked: string[];
        prices: Record<string, number>;
        currency: Venue['layout']['pricing']['currency'];
      }>(
        `/venues/${venueId}/availability?${new URLSearchParams({ start: timeStart, end: timeEnd, ...(seatVenue ? { showId } : {}) })}`,
        { signal: controller.signal },
      )
        .then((data) => {
          setBusy(data.busy);
          setBlocked(data.blocked ?? []);
          setPriceQuote({ key: quoteKey, prices: data.prices, currency: data.currency });
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
  }, [venueId, timeStart, timeEnd, showId, refresh, venue?.kind, venue?.revision, quoteKey]);
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);
  const chooseVenue = (id: string) => {
    if (dirty && !confirm('Discard unsaved layout changes?')) return;
    setVenueTab('map');
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
  const openShow = (show?: Show) => {
    setEditingShow(show ?? null);
    setShowTitle(show?.title ?? '');
    setShowStart(localTime(show ? new Date(show.start) : new Date(Date.now() + 3600000)));
    setShowEnd(localTime(show ? new Date(show.end) : new Date(Date.now() + 7200000)));
    setError('');
    setModal('show');
  };
  const removeEvent = (event: ManagedEvent, cancel: boolean) =>
    void run(async () => {
      await api(`/venues/${venueId}/shows/${event.id}${cancel ? '/cancel' : ''}`, {
        method: cancel ? 'POST' : 'DELETE',
      });
      setShows((items) => items.filter((show) => show.id !== event.id));
      if (showId === event.id) setShowId('');
      setEventsRevision((n) => n + 1);
      setRefresh((n) => n + 1);
      await load();
      setMessage(
        cancel
          ? 'Event cancelled. Reservation history kept.'
          : 'Event deleted. Reservation history kept.',
      );
    });
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
      setVenues((v) => v.map((x) => (x.id === result.id ? { ...x, ...result } : x)));
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
      const booking = await reserveBooking(
        {
          venueId: venue.id,
          resourceId: bookingResources[0].id,
          ...(seatVenue ? { resourceIds: bookingResources.map((r) => r.id) } : {}),
          partySize,
          expectedTotal: total,
          expectedCurrency: currency,
          guestName: guest,
          guestEmail: guestEmail.trim() || undefined,
          guestPhone: guestPhone.trim() || undefined,
          ...interval,
          ...(seatVenue ? { showId } : {}),
        },
        async () => {
          if (seatVenue) setShows(await api<Show[]>(`/venues/${venueId}/shows`));
          await load();
          setRefresh((v) => v + 1);
        },
      );
      setConfirmation(booking);
      setStep('done');
      setRefresh((v) => v + 1);
      setGuest('');
      setGuestEmail('');
      setGuestPhone('');
      setMessage(
        `Reservation confirmed for ${bookingResources.map((r) => seatLocation(r)).join(', ')}.`,
      );
    });
  const showBookings = () => {
    setTab('bookings');
    setMessage('');
  };
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
          {shows.length === 0 && <p className="muted">No upcoming shows are available.</p>}
          {admin && (
            <button className="text-button" onClick={() => openShow()}>
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
  const shareBooking = (embed: boolean) =>
    void run(async () => {
      if (!venue) return;
      const { publicOrigin } = publicConfigSchema.parse(await api('/public-config'));
      const url = new URL(`/book/${venue.id}`, publicOrigin ?? window.location.origin);
      if (seatVenue && showId) url.searchParams.set('show', showId);
      if (embed) setEmbedUrl(url.href);
      else {
        await navigator.clipboard.writeText(url.href);
        setMessage('Booking link copied.');
      }
    });
  const directory = () => {
    if (dirty && !confirm('Discard unsaved layout changes?')) return;
    setEditing(false);
    setDirty(false);
    setTab('map');
    setStep(publicBooking ? 'time' : 'venues');
    if (publicBooking) {
      setSelected('');
      setSelectedSeats([]);
    }
    setConfirmation(null);
    setMessage('');
  };
  const venueTabs = admin && seatVenue && !editing && (
    <div
      role="tablist"
      aria-label="Venue view"
      className="flex gap-2 border-y border-stone-100 px-6 py-3"
    >
      {(['map', 'events'] as const).map((item) => (
        <button
          key={item}
          role="tab"
          aria-selected={venueTab === item}
          className={venueTab === item ? 'primary' : 'secondary'}
          onClick={() => setVenueTab(item)}
        >
          {item === 'map' ? 'Map' : 'Events'}
        </button>
      ))}
    </div>
  );
  const activeVenues = venues.filter((v) => !v.archivedAt);
  const isReview = !admin && step === 'review';
  const navItem = (active: boolean) =>
    `nav-item flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[13px] font-medium transition max-sm:mb-1 max-sm:inline-flex max-sm:w-auto max-sm:self-start ${
      active ? 'bg-white/10 text-white' : 'text-forest-200 hover:bg-white/5 hover:text-white'
    }`;
  const sideLabel =
    'mb-2 px-3 text-[10px] font-semibold tracking-[0.16em] text-forest-300/70 max-sm:hidden';
  const inspectorWidth = isReview
    ? 'mx-auto w-auto max-w-[560px] p-8 max-sm:p-5'
    : editing
      ? 'border-stone-100 p-5 max-lg:w-full max-lg:border-t lg:w-[330px] lg:overflow-y-auto lg:overscroll-contain lg:border-l lg:[scrollbar-gutter:stable]'
      : 'border-stone-100 p-6 max-lg:w-full max-lg:border-t lg:w-[300px] lg:border-l 2xl:w-[340px] 2xl:p-7';
  if (publicBooking && publicError)
    return (
      <main className="mx-auto max-w-xl p-6">
        <h1>Booking unavailable</h1>
        <p className="mt-4" role="alert">
          {publicError}
        </p>
      </main>
    );
  if (!publicBooking && session?.role === 'staff')
    return (
      <main className="mx-auto max-w-[1600px] p-4 sm:p-8">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <span>
            {session.user?.name} · {session.role}
          </span>
          <button className="secondary" aria-label="Sign out" onClick={() => void signOut()}>
            Sign out
          </button>
        </header>
        {error && <p role="alert">{error}</p>}
        <p role="status">{message}</p>
        <Reservations staff onMessage={setMessage} onChange={() => setRefresh((n) => n + 1)} />
      </main>
    );
  return (
    <div
      className={
        publicBooking ? 'public-booking min-h-screen' : 'shell flex min-h-screen max-sm:block'
      }
      inert={working}
      aria-busy={working}
    >
      {!publicBooking && (
        <aside className="sidebar sticky top-0 flex h-screen w-64 shrink-0 flex-col bg-forest-950 px-4 pt-6 pb-4 text-forest-100 max-lg:w-56 max-sm:relative max-sm:h-auto max-sm:w-full max-sm:py-3">
          <a
            href="/"
            className="brand mb-9 flex items-center gap-2.5 px-2 font-display text-[19px] font-bold tracking-[-0.03em] text-white max-sm:mb-3"
          >
            <span className="grid size-8 place-items-center rounded-lg bg-sprout-300 text-[17px] text-forest-950">
              <Layers
                className="size-5 inline-block shrink-0"
                aria-hidden="true"
                strokeWidth={1.75}
              />
            </span>{' '}
            openvenue
            <span className="ml-0.5 rounded border border-white/15 px-1.5 py-0.5 text-[9px] font-semibold tracking-wider text-forest-200 max-lg:hidden">
              BETA
            </span>
          </a>
          <div className={sideLabel}>YOUR WORKSPACE</div>
          {admin && (
            <button
              className={navItem(tab === 'overview')}
              onClick={() => {
                if (dirty && !confirm('Discard unsaved layout changes?')) return;
                setEditing(false);
                setDirty(false);
                setTab('overview');
              }}
            >
              Overview
            </button>
          )}
          <button className={navItem(tab === 'map')} onClick={directory}>
            <span className="text-base opacity-80">
              <LayoutGrid
                className="size-5 inline-block shrink-0"
                aria-hidden="true"
                strokeWidth={1.75}
              />
            </span>{' '}
            Browse venues{' '}
            <span className="ml-auto rounded-md bg-white/10 px-1.5 py-0.5 text-[11px] text-forest-100 tabular-nums">
              {activeVenues.length}
            </span>
          </button>
          {admin && (
            <button
              aria-label="Reservations"
              className={navItem(tab === 'bookings')}
              onClick={showBookings}
            >
              <span className="text-base opacity-80">
                <CalendarCheck
                  className="size-5 inline-block shrink-0"
                  aria-hidden="true"
                  strokeWidth={1.75}
                />
              </span>{' '}
              Reservations
            </button>
          )}
          {session?.role === 'owner' && (
            <button
              className={navItem(tab === 'team')}
              onClick={() => {
                if (dirty && !confirm('Discard unsaved layout changes?')) return;
                setEditing(false);
                setDirty(false);
                setTab('team');
              }}
            >
              Team
            </button>
          )}
          <div className="mx-3 my-5 h-px bg-white/10 max-sm:hidden" />
          <div className={sideLabel}>YOUR VENUES</div>
          {activeVenues.length > 6 && (
            <input
              type="search"
              aria-label="Search venues"
              placeholder="Search venues"
              className="mb-3 min-h-9 text-sm text-ink"
              value={venueSearch}
              onChange={(event) => setVenueSearch(event.target.value)}
            />
          )}
          <div className="venue-list -mx-1 min-h-0 overflow-auto px-1 max-sm:flex max-sm:gap-1.5 max-sm:overflow-x-auto">
            {(['restaurant', 'parking', 'cinema', 'stadium'] as const).map((kind) => {
              const matches = activeVenues.filter(
                (v) =>
                  v.kind === kind &&
                  `${v.name} ${v.kind}`.toLowerCase().includes(venueSearch.trim().toLowerCase()),
              );
              if (!matches.length) return null;
              return (
                <div key={kind} className="max-sm:flex max-sm:gap-1.5">
                  <div className="px-3 pt-3 pb-1 text-[11px] font-semibold text-forest-300 max-sm:hidden">
                    {
                      {
                        restaurant: 'Restaurants',
                        parking: 'Parking',
                        cinema: 'Cinemas',
                        stadium: 'Stadiums',
                      }[kind]
                    }
                  </div>
                  {matches.map((v) => (
                    <button
                      className={`venue-link mb-0.5 flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-[13px] leading-snug transition max-sm:w-auto max-sm:min-w-36 max-sm:shrink-0 ${
                        venueId === v.id
                          ? 'bg-white/10 text-white'
                          : 'text-forest-100 hover:bg-white/5'
                      }`}
                      key={v.id}
                      ref={venueId === v.id ? selectedVenueButton : undefined}
                      onClick={() => chooseVenue(v.id)}
                    >
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/[0.06] text-base text-sprout-300 ring-1 ring-white/10 max-sm:size-7">
                        {types[v.kind].icon}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate" title={v.name}>
                          {v.name}
                        </span>
                        <small className="mt-0.5 text-[11px] text-forest-300/80">
                          {types[v.kind].name}
                        </small>
                      </span>
                      {venueId === v.id && (
                        <span className="size-1.5 shrink-0 rounded-full bg-sprout-300 max-sm:hidden" />
                      )}
                    </button>
                  ))}
                </div>
              );
            })}
            {activeVenues.length > 0 &&
              !activeVenues.some((v) =>
                `${v.name} ${v.kind}`.toLowerCase().includes(venueSearch.trim().toLowerCase()),
              ) && (
                <p role="status" className="px-3 py-2 text-xs text-forest-300">
                  No matching venues.
                </p>
              )}
          </div>
          {admin && venues.some((v) => v.archivedAt) && (
            <details className="mt-3 text-xs">
              <summary className="cursor-pointer px-3 py-2 text-forest-300">Archived</summary>
              <div className="max-h-48 overflow-auto">
                {venues
                  .filter((v) => v.archivedAt)
                  .map((v) => (
                    <div key={v.id} className="flex items-center gap-2 px-3 py-2">
                      <span className="min-w-0 flex-1 truncate" title={v.name}>
                        {v.name}
                      </span>
                      <button
                        className="shrink-0 underline"
                        aria-label={`Restore ${v.name}`}
                        onClick={() =>
                          void run(async () => {
                            const restored = await api<Venue>(
                              `/venues/${v.id}`,
                              json({ archived: false, revision: v.revision }, 'PATCH'),
                            );
                            setVenues((items) =>
                              items.map((item) =>
                                item.id === v.id ? { ...item, ...restored } : item,
                              ),
                            );
                            setMessage(`${v.name} restored.`);
                          })
                        }
                      >
                        Restore
                      </button>
                    </div>
                  ))}
              </div>
            </details>
          )}
          {admin && (
            <button
              className="add-venue mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] text-forest-300 transition hover:bg-white/5 hover:text-white"
              aria-label="New venue"
              onClick={() => openCreate()}
            >
              + New venue
            </button>
          )}
          <div className="mt-auto pt-6 max-sm:pt-2">
            <div className="mb-3 flex gap-3 max-sm:hidden rounded-xl bg-white/[0.04] p-3 text-xs text-forest-100 ring-1 ring-white/5">
              <span className="text-lg leading-none text-sprout-300">
                <ArrowUpRight
                  className="size-4 inline-block shrink-0"
                  aria-hidden="true"
                  strokeWidth={1.75}
                />
              </span>
              <div>
                Made to be yours
                <small className="mt-0.5 text-[11px] text-forest-300/70">
                  Open source. Open possibilities.
                </small>
              </div>
            </div>
            <button
              className="profile flex w-full items-center gap-3 rounded-xl p-2 text-left text-[13px] text-white transition hover:bg-white/5"
              aria-label={admin ? 'Sign out' : undefined}
              onClick={() => (admin ? void signOut() : openLogin())}
            >
              <span className="avatar grid size-9 shrink-0 place-items-center rounded-full bg-sprout-300/15 text-xs font-semibold text-sprout-300 ring-1 ring-sprout-300/25">
                {admin ? 'AD' : 'G'}
              </span>
              <span className="min-w-0 flex-1">
                {admin ? (session?.user?.name ?? 'Setup owner') : 'Guest booking'}
                <small className="mt-0.5 text-[11px] text-forest-300">
                  {admin ? `${session?.role} · Sign out` : 'Admin sign in'}
                </small>
              </span>
              <span className="text-forest-300">
                <ArrowUpRight
                  className="size-4 inline-block shrink-0"
                  aria-hidden="true"
                  strokeWidth={1.75}
                />
              </span>
            </button>
          </div>
        </aside>
      )}
      <main className="main min-w-0 flex-1">
        {!publicBooking && (
          <header className="topbar flex h-14 items-center justify-between border-b border-stone-200/70 px-8 text-[13px] text-stone-500 max-lg:px-6 max-sm:h-12 max-sm:px-4">
            <div>
              Workspace <span className="mx-2 text-stone-300">/</span>{' '}
              <span className="font-medium text-ink">
                {tab === 'team'
                  ? 'Team'
                  : tab === 'overview'
                    ? 'Overview'
                    : tab === 'bookings'
                      ? 'Reservations'
                      : admin
                        ? 'Venue management'
                        : 'Book a place'}
              </span>
            </div>
            <div className="flex items-center gap-2.5 max-md:hidden">
              <span className="live-dot" /> Self-hosted workspace{' '}
              <span className="rounded-md border border-stone-200 bg-white px-1.5 py-0.5 text-[11px] text-stone-500">
                v0.1
              </span>
            </div>
          </header>
        )}
        <div
          className={`content mx-auto max-w-[1600px] px-8 max-lg:px-6 max-sm:px-4 ${admin && step !== 'venues' ? 'py-3' : 'py-8 max-sm:py-6'}`}
        >
          {publicBooking && !publicBooking.embed && venue && (
            <header className="booking-hero mb-6 rounded-2xl bg-forest-50 p-6 ring-1 ring-forest-100">
              <p className="eyebrow">Reserve your visit</p>
              <h1 className="mt-2">{venue.name}</h1>
              <p className="mt-2 text-sm text-stone-600">
                Choose your time and place. Keep your confirmation for arrival.
              </p>
            </header>
          )}
          {step === 'venues' && tab === 'map' && (
            <div className="page-heading mb-7 flex items-end justify-between gap-5 max-sm:flex-col max-sm:items-start">
              <div>
                <div className="eyebrow">
                  {admin ? 'OPERATOR WORKSPACE' : 'RESERVE YOUR NEXT VISIT'}
                </div>
                <h1 className="mt-2 mb-1.5">
                  {admin ? 'Manage your venues' : 'Where would you like to go?'}
                </h1>
                <p className="text-sm text-stone-500">
                  {admin
                    ? 'Set up spaces, edit layouts and manage guest reservations.'
                    : 'Choose a venue, find your place and reserve in a few steps.'}
                </p>
              </div>
              {!admin && (
                <button className="secondary" onClick={openLogin}>
                  Admin sign in
                </button>
              )}
            </div>
          )}
          {error && modal !== 'login' && (
            <div
              className="notice mb-4 flex items-center justify-between gap-3 rounded-xl bg-red-50 px-4 py-3 text-[13px] text-red-800 ring-1 ring-red-200/70"
              role="alert"
            >
              {error}
              <button
                className="rounded-md px-2 text-lg leading-none text-red-700 hover:bg-red-100"
                aria-label="Dismiss error"
                onClick={() => setError('')}
              >
                <X className="size-4 inline-block shrink-0" aria-hidden="true" strokeWidth={1.75} />
              </button>
            </div>
          )}
          <div
            className={
              message
                ? "notice mb-4 flex items-center gap-2.5 rounded-xl bg-forest-50 px-4 py-3 text-[13px] text-forest-800 ring-1 ring-forest-200/70 before:size-1.5 before:shrink-0 before:rounded-full before:bg-forest-500 before:content-['']"
                : 'sr-only'
            }
            role="status"
            aria-live="polite"
          >
            {message}
          </div>
          {!admin && tab === 'map' && (publicBooking || step !== 'done') && (
            <BookingProgress step={step} publicPage={!!publicBooking} />
          )}
          {tab === 'overview' && session?.bootstrap && (
            <p className="mb-4">
              Replace the shared setup password with your own account.{' '}
              <button className="text-button" onClick={() => setTab('team')}>
                Create first owner
              </button>
            </p>
          )}
          {tab === 'team' && session?.role === 'owner' ? (
            <Team bootstrap={session.bootstrap} onChange={refreshSession} />
          ) : tab === 'overview' && admin ? (
            <Overview
              onReservations={showBookings}
              onEvent={(id, eventId) => {
                chooseVenue(id);
                setOverviewEvent(eventId);
              }}
            />
          ) : tab === 'bookings' ? (
            <Reservations onMessage={setMessage} onChange={() => setRefresh((n) => n + 1)} />
          ) : step === 'venues' ? (
            <section aria-label="Venue directory">
              <div
                className="directory-filters mb-6 flex flex-wrap gap-2"
                aria-label="Filter venues"
              >
                {(['all', 'restaurant', 'parking', 'cinema', 'stadium'] as const).map((type) => (
                  <button
                    key={type}
                    className={`${filter === type ? 'primary' : 'secondary'} rounded-full`}
                    aria-pressed={filter === type}
                    onClick={() => setFilter(type)}
                  >
                    {type === 'all' ? 'All venues' : types[type].name}
                  </button>
                ))}
              </div>
              <div className="venue-directory grid grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-6">
                {venues
                  .filter((v) => !v.archivedAt && (filter === 'all' || v.kind === filter))
                  .map((v) => (
                    <article
                      className="panel directory-card flex flex-col transition duration-200 hover:-translate-y-0.5 hover:shadow-float"
                      key={v.id}
                    >
                      <LayoutThumbnail venue={v} />
                      <div className="directory-details flex flex-1 flex-col p-6">
                        <div className="eyebrow">{types[v.kind].name}</div>
                        <h2 className="mt-2 mb-1">{v.name}</h2>
                        <p className="mb-6 text-[13px] text-stone-500">
                          {v.layout.floors.reduce((n, f) => n + f.resources.length, 0)}{' '}
                          {v.kind === 'restaurant'
                            ? 'tables'
                            : v.kind === 'parking'
                              ? 'parking spaces'
                              : 'seats'}{' '}
                          · {v.layout.floors.length}{' '}
                          {v.layout.floors.length === 1 ? 'floor' : 'floors'}
                        </p>
                        {['cinema', 'stadium'].includes(v.kind) && v.nextEventAt && (
                          <p className="mb-4 text-[13px] text-stone-500">
                            Next event ·{' '}
                            <time dateTime={v.nextEventAt}>
                              {new Date(v.nextEventAt).toLocaleString()}
                            </time>
                          </p>
                        )}
                        <button
                          className="primary full mt-auto h-auto min-h-9 py-2 text-left whitespace-normal"
                          onClick={() => chooseVenue(v.id)}
                        >
                          {admin ? 'Manage' : 'Book'} {v.name} →
                        </button>
                      </div>
                    </article>
                  ))}
              </div>
              {loaded && !activeVenues.some((v) => filter === 'all' || v.kind === filter) && (
                <p className="empty">No venues in this category yet.</p>
              )}
              {!loaded && <p className="empty">Loading venues…</p>}
            </section>
          ) : step === 'done' && confirmation ? (
            <BookingConfirmation confirmation={confirmation} venue={venue} onAgain={directory} />
          ) : !admin && step === 'time' && venue ? (
            <section className="panel journey-panel mx-auto max-w-[640px] p-8 max-sm:p-6 [&_label]:my-5">
              {!publicBooking && (
                <button className="text-button -ml-2" onClick={directory}>
                  ← All venues
                </button>
              )}
              <div className="eyebrow mt-4">{types[venue.kind].name}</div>
              <h2 className="mt-2 mb-2 text-[26px]">{venue.name}</h2>
              <p className="leading-relaxed text-stone-600">
                {seatVenue
                  ? 'Choose your screening before selecting a seat.'
                  : 'When will you visit? Availability is checked for the whole stay.'}
              </p>
              {timeFields}
              {interval && !validTime && !seatVenue && (
                <p className="field-error">Choose an arrival time in the future.</p>
              )}
              <p className="muted">Times are shown in your device’s local time zone.</p>
              {validTime && !availabilityReady && (
                <p className="mb-3 text-[13px] text-stone-500" role="status">
                  Checking availability…
                </p>
              )}
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
                : publicBooking
                  ? 'Loading booking…'
                  : 'Opening your workspace…'}
            </div>
          ) : admin && seatVenue && venueTab === 'events' && !editing ? (
            <section className="panel venue-panel">
              <h2 className="px-6 py-5">{current.name}</h2>
              {venueTabs}
              <Events
                venueId={venueId}
                stadium={current.kind === 'stadium'}
                revision={eventsRevision}
                onAdd={() => openShow()}
                onEdit={openShow}
                onRemove={removeEvent}
                onManage={(event) => {
                  setShows((items) => [...items.filter((show) => show.id !== event.id), event]);
                  setShowId(event.id);
                  setManagingSeats(true);
                  setVenueTab('map');
                }}
              />
            </section>
          ) : (
            <section
              className={`panel venue-panel ${admin ? 'operator-venue' : ''} ${editing ? 'layout-editor overflow-clip' : ''}`}
            >
              <div
                className={`flex items-center justify-between gap-4 px-6 py-3 max-lg:flex-wrap max-sm:items-start max-sm:px-4 ${
                  editing ? 'sticky top-0 z-10 border-b border-stone-100 bg-white' : ''
                }`}
              >
                <div className="flex items-center gap-3.5">
                  <span className="grid size-11 place-items-center rounded-xl bg-forest-50 text-xl text-forest-700 ring-1 ring-forest-100 max-sm:hidden">
                    {types[current.kind].icon}
                  </span>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="max-sm:text-base">{current.name}</h2>
                      {dirty && (
                        <span className="pill">
                          <span
                            aria-hidden="true"
                            className="mr-1 inline-block size-1.5 rounded-full bg-amber-500"
                          />
                          Unsaved changes
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-stone-500">
                      {types[current.kind].name} <span className="mx-1 text-stone-300">·</span>{' '}
                      {current.layout.floors.length}{' '}
                      {current.layout.floors.length === 1 ? 'floor' : 'floors'}{' '}
                      <span className="mx-1 text-stone-300">·</span>{' '}
                      {current.layout.floors.reduce((n, f) => n + f.resources.length, 0)} resources
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  {admin && seatVenue && !editing && (
                    <button
                      className="secondary"
                      disabled={!showId}
                      onClick={() => setManagingSeats(!managingSeats)}
                    >
                      {managingSeats ? 'Done managing seats' : 'Manage event seats'}
                    </button>
                  )}
                  {admin && (
                    <>
                      {!editing && (
                        <Menu
                          label="More venue actions"
                          items={[
                            { label: 'Duplicate', onSelect: () => openCreate(current) },
                            { label: 'Generate with Claude', onSelect: () => setModal('generate') },
                            { label: 'Share booking link', onSelect: () => shareBooking(false) },
                            { label: 'Embed', onSelect: () => shareBooking(true) },
                            {
                              label: 'Venue settings',
                              onSelect: () => {
                                setError('');
                                setModal('settings');
                              },
                            },
                          ]}
                        />
                      )}
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
                          className="primary"
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
              {venueTabs}
              {!admin && (
                <div className="visit-summary flex flex-wrap items-center gap-3 border-t border-stone-100 bg-forest-50/50 px-6 py-3 text-[13px] text-stone-700 max-sm:px-4">
                  <button className="text-button -ml-2" onClick={() => setStep('time')}>
                    ← Change time
                  </button>
                  <span>
                    {activeShow?.title}
                    {interval &&
                      ` · ${new Date(interval.start).toLocaleString()} – ${new Date(interval.end).toLocaleString()}`}
                  </span>
                </div>
              )}
              <div
                className={`${isReview ? 'hidden' : 'flex'} map-toolbar flex-wrap items-center gap-5 border-y border-stone-100 bg-stone-50/60 px-6 py-2.5 max-lg:gap-3 max-lg:px-4 max-sm:px-3`}
              >
                <label className="floor-control m-0 flex-row items-center gap-2.5 text-xs text-stone-500">
                  Floor
                  <select
                    aria-label="Floor"
                    className="w-auto min-w-40 py-1.5 max-sm:max-w-36 max-sm:min-w-28"
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
                {current.layout.pricing.mode === 'tiers' && (
                  <label className="check m-0 text-xs">
                    <input
                      type="checkbox"
                      checked={colourByPrice}
                      onChange={(event) => setColourByPrice(event.target.checked)}
                    />
                    Colour by price
                  </label>
                )}
                <div
                  className={`legend ml-auto flex min-w-0 flex-wrap gap-4 text-xs text-stone-500 max-lg:gap-2.5 ${priceColors ? '' : 'max-md:hidden'}`}
                >
                  {priceColors &&
                    current.layout.pricing.tiers?.map((tier) => {
                      const assignedResource = current.layout.floors
                        .flatMap((floor) => floor.resources)
                        .find((resource) => resource.tierId === tier.id);
                      const amount =
                        !editing && assignedResource ? quotedPrice(assignedResource) : tier.amount;
                      return (
                        <span
                          key={tier.id}
                          className="flex min-w-0 max-w-full items-center gap-1.5 break-all"
                        >
                          <i
                            className="size-2.5 shrink-0 rounded-sm ring-1 ring-stone-300"
                            style={{ backgroundColor: tier.color }}
                          />
                          {tier.name} ·{' '}
                          {formatPrice(
                            amount,
                            editing ? current.layout.pricing.currency : currency,
                          )}
                        </span>
                      );
                    })}
                  {(
                    [
                      ['Available', 'bg-[#d6e2d3] ring-[#9fb49b]'],
                      ['Reserved', 'bg-[#ecd6c4] ring-[#c4a185]'],
                      ['Selected', 'bg-sprout-300 ring-sprout-500'],
                      ['Blocked', 'bg-[#c3c9d0] ring-[#8c96a3]'],
                    ] as const
                  ).map(([label, swatch]) => (
                    <span key={label} className="flex items-center gap-1.5">
                      <i className={`size-2.5 rounded-[3px] ring-1 ring-inset ${swatch}`} />
                      {label}
                    </span>
                  ))}
                </div>
                <div className="view-toggle flex rounded-lg bg-stone-200/60 p-0.5 max-md:ml-auto">
                  {(['2d', '3d'] as const).map((v) => (
                    <button
                      key={v}
                      className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                        view === v ? 'bg-white text-ink shadow-sm' : 'text-stone-500 hover:text-ink'
                      }`}
                      aria-label={v === '2d' ? '2D view' : '3D view'}
                      aria-pressed={view === v}
                      onClick={() => setView(v)}
                    >
                      {v === '2d' ? (
                        <>
                          <Map
                            className="size-4 inline-block shrink-0"
                            aria-hidden="true"
                            strokeWidth={1.75}
                          />{' '}
                          2D
                        </>
                      ) : (
                        <>
                          <Box
                            className="size-4 inline-block shrink-0"
                            aria-hidden="true"
                            strokeWidth={1.75}
                          />{' '}
                          3D
                        </>
                      )}
                    </button>
                  ))}
                </div>
              </div>
              <div
                className={`map-body ${isReview ? 'block' : 'flex items-stretch max-lg:flex-col'} ${
                  admin
                    ? 'lg:h-[calc(100dvh-240px)] lg:min-h-[480px]'
                    : editing
                      ? 'lg:h-[clamp(520px,70vh,780px)]'
                      : ''
                }`}
              >
                <div
                  className={`map-column ${isReview ? 'hidden' : 'flex'} min-w-0 flex-1 flex-col`}
                >
                  {view === '2d' ? (
                    <Map2D
                      key={floor.id}
                      floor={floor}
                      kind={current.kind}
                      selected={selected}
                      selectedIds={editing ? [] : managingSeats ? managedIds : selectedSeats}
                      busy={busy}
                      blocked={blocked}
                      editing={editing && !painting}
                      priceColors={priceColors}
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
                          selectedIds={editing ? [] : managingSeats ? managedIds : selectedSeats}
                          busy={busy}
                          blocked={blocked}
                          onSelect={selectPlace}
                          editing={editing && !painting}
                          priceColors={priceColors}
                          onMove={moveResource}
                        />
                      </Suspense>
                    </SceneBoundary>
                  )}
                  <div className="map-footer flex items-center justify-between gap-3 border-t border-stone-100 bg-white px-5 py-3 text-xs text-stone-500">
                    <span className="flex items-center gap-2 font-medium text-stone-700">
                      <i className="live-dot" />
                      {editing
                        ? 'Editing layout'
                        : availabilityReady
                          ? `${floor.resources.filter((r) => !busy.includes(r.id)).length} of ${floor.resources.length} available`
                          : 'Choose a valid time to check availability'}
                    </span>
                    <span className="max-sm:hidden">
                      {editing
                        ? dirty
                          ? 'Save to publish edits'
                          : 'Layout is up to date'
                        : 'Availability refreshes every 15 seconds'}
                    </span>
                  </div>
                </div>
                <aside className={`inspector shrink-0 bg-white ${inspectorWidth}`}>
                  {editing ? (
                    <LayoutInspector
                      paintTier={painting ? paintTier : null}
                      onPaintTier={(id) => {
                        setPaintTier(id);
                        setSelected('');
                        if (id !== null) setColourByPrice(true);
                      }}
                      scope={selectionScope}
                      onScope={setSelectionScope}
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
                  ) : managingSeats && admin && showId ? (
                    <>
                      {timeFields}
                      <EventPricingCard
                        key={venueId + showId}
                        venueId={venueId}
                        showId={showId}
                        layout={current.layout}
                        run={run}
                        working={working}
                        onChanged={(text) => {
                          setMessage(text);
                          setRefresh((value) => value + 1);
                        }}
                      />
                      <EventSeatControls
                        key={venueId + showId + floor.id}
                        venueId={venueId}
                        showId={showId}
                        floor={floor}
                        selectedIds={managedIds}
                        blockedIds={blocked}
                        scope={selectionScope}
                        onScope={setSelectionScope}
                        onClear={() => setManagedIds([])}
                        run={run}
                        working={working}
                        onChanged={(text) => {
                          setMessage(text);
                          setRefresh((v) => v + 1);
                        }}
                      />
                    </>
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
                        <p className="text-[13px] text-stone-600">
                          <strong className="font-semibold text-ink">{floor.name}</strong>
                          <br />
                          {activeShow?.title}
                        </p>
                      )}
                      <div
                        className={`selection-card my-5 flex flex-col items-center rounded-xl border border-dashed px-4 py-5 text-center transition ${
                          bookingResources.length
                            ? 'has-selection border-sprout-500/60 bg-sprout-100/60'
                            : 'border-stone-200 bg-stone-50'
                        }`}
                      >
                        <span
                          className={`mb-2 text-2xl ${bookingResources.length ? 'text-forest-600' : 'text-stone-400'}`}
                        >
                          {resource ? (
                            types[current.kind].icon
                          ) : (
                            <MapPin
                              className="size-4 inline-block shrink-0"
                              aria-hidden="true"
                              strokeWidth={1.75}
                            />
                          )}
                        </span>
                        <strong
                          className={`text-[13px] font-semibold ${bookingResources.length ? 'text-forest-900' : 'text-stone-600'}`}
                        >
                          {bookingResources.length
                            ? bookingResources.map((r) => seatLocation(r)).join(', ')
                            : 'Your spot is waiting'}
                        </strong>
                        <small className="mt-1 text-xs text-stone-500">
                          {seatVenue
                            ? `${bookingResources.length} seats selected`
                            : resource
                              ? `${resource.kind === 'table' ? `${resource.capacity} guests` : '1 place'}${resource.accessible ? ' · Accessible' : ''}${resource.ev ? ' · EV charging' : ''}`
                              : 'Select a resource on the map'}
                        </small>
                        {resource && busy.includes(resource.id) && (
                          <span className="mt-2 text-xs font-medium text-amber-700">
                            Reserved for this time
                          </span>
                        )}
                      </div>
                      {seatVenue && bookingResources.some((r) => busy.includes(r.id)) && (
                        <p className="field-error">
                          A selected seat is no longer available. Remove it and choose another.
                        </p>
                      )}
                      {seatVenue && step !== 'review' && bookingResources.length > 0 && (
                        <div className="mb-3 flex flex-wrap gap-1.5">
                          {bookingResources.map((r) => (
                            <button
                              className="secondary h-7 rounded-full px-2.5 text-xs"
                              key={r.id}
                              onClick={() => selectPlace(r.id)}
                              aria-label={`Remove ${r.label}`}
                            >
                              {seatLocation(r)}{' '}
                              <X
                                className="size-4 inline-block shrink-0"
                                aria-hidden="true"
                                strokeWidth={1.75}
                              />
                            </button>
                          ))}
                        </div>
                      )}
                      {seatVenue && (
                        <p className="my-3 text-[13px] text-stone-600">
                          {selectedSeats.length} of {partySize} seats selected. Select a chosen seat
                          again to remove it.
                        </p>
                      )}
                      {!seatVenue && venue?.kind === 'restaurant' && (
                        <p className="my-3 text-[13px] text-stone-600">
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
                        <div
                          className="price-summary my-4 rounded-xl bg-stone-50 p-4 text-[13px] ring-1 ring-stone-100"
                          aria-label="Reservation price summary"
                        >
                          {bookingResources.map((r) => (
                            <p
                              key={r.id}
                              className="flex justify-between gap-4 py-0.5 text-stone-600"
                            >
                              {seatLocation(r)}
                              <strong className="font-medium text-ink tabular-nums">
                                {formatPrice(quotedPrice(r), currency)}
                              </strong>
                            </p>
                          ))}
                          <p className="mt-2 flex items-baseline justify-between gap-4 border-t border-stone-200 pt-2.5 font-semibold text-ink">
                            Total
                            <strong className="font-display text-base tabular-nums">
                              {formatPrice(total, currency)}
                            </strong>
                          </p>
                          <small className="mt-2 text-xs leading-normal text-stone-500">
                            For the entire reservation. Payment is not collected here.
                          </small>
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
                                {seatLocation(r)}

                                {selectedSeats.includes(r.id) ? ' · Selected' : ''}
                                {venue?.layout.pricing.mode !== 'free'
                                  ? ` · ${formatPrice(quotedPrice(r), currency)}`
                                  : ''}
                                {busy.includes(r.id)
                                  ? blocked.includes(r.id)
                                    ? ' · Blocked'
                                    : ' · Reserved'
                                  : ''}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      {!admin && step === 'place' ? (
                        <button
                          className="primary full h-10"
                          disabled={!canReserve}
                          onClick={() => setStep('review')}
                        >
                          Review reservation →
                        </button>
                      ) : (
                        <>
                          {!admin && (
                            <button
                              className="text-button -ml-2 mb-2"
                              onClick={() => setStep('place')}
                            >
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
                            <label>
                              Email (optional)
                              <input
                                type="email"
                                autoComplete="email"
                                maxLength={254}
                                value={guestEmail}
                                onChange={(e) => setGuestEmail(e.target.value)}
                              />
                            </label>
                            <label>
                              Phone (optional)
                              <input
                                type="tel"
                                autoComplete="tel"
                                maxLength={40}
                                value={guestPhone}
                                onChange={(e) => setGuestPhone(e.target.value)}
                              />
                            </label>
                            <button className="primary full h-10" disabled={working || !canReserve}>
                              Confirm reservation{' '}
                              <span>
                                <ArrowUpRight
                                  className="size-4 inline-block shrink-0"
                                  aria-hidden="true"
                                  strokeWidth={1.75}
                                />
                              </span>
                            </button>
                          </form>
                        </>
                      )}
                      <p className="privacy-note mt-3 text-center text-xs leading-relaxed text-stone-400">
                        Your details are visible only to the venue administrator.
                      </p>
                    </>
                  )}
                </aside>
              </div>
            </section>
          )}
          {!admin && !publicBooking?.embed && (
            <footer className="page-footer mt-6 flex justify-between gap-3 text-xs text-stone-400">
              <span>Thoughtfully mapped. Effortlessly reserved.</span>
              <span className="max-sm:hidden">OpenVenue · Built for shared spaces</span>
            </footer>
          )}
        </div>
      </main>
      {embedUrl && <BookingEmbed url={embedUrl} onClose={() => setEmbedUrl('')} />}
      {modal === 'settings' && current && (
        <VenueSettings
          venue={current}
          working={working}
          error={error}
          onClose={() => setModal(null)}
          onSave={(patch) =>
            void run(async () => {
              const updated = await api<Venue>(
                `/venues/${current.id}`,
                json({ ...patch, revision: current.revision }, 'PATCH'),
              );
              setVenues((items) =>
                items.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)),
              );
              setModal(null);
              if (updated.archivedAt) {
                setStep('venues');
                setVenueId(activeVenues.find((v) => v.id !== updated.id)?.id ?? '');
              }
              setMessage(
                updated.archivedAt
                  ? 'Venue archived. Existing reservations were kept.'
                  : 'Venue settings saved.',
              );
            })
          }
        />
      )}
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
                await api(
                  '/auth/login',
                  json({ password, ...(email.trim() ? { email: email.trim() } : {}) }),
                );
                setSession(await api<Session>('/auth/me'));
                closeLogin();
                setTab('overview');
                setStep('venues');
                setMessage('Signed in.');
              });
            }}
          >
            <label>
              Email
              <input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
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
              Use your account email and password. For initial setup, leave email blank and use the
              shared admin password.
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
            <div className="template-preview flex items-start gap-3.5 rounded-xl bg-forest-50/60 p-4 ring-1 ring-forest-100">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-white text-xl text-forest-700 shadow-xs ring-1 ring-forest-100">
                {types[kind].icon}
              </span>
              <div>
                <strong className="text-[13px] font-semibold">{types[kind].name}</strong>
                <p className="mt-1 text-xs text-stone-500">
                  {kind === 'restaurant'
                    ? 'Bistro · dining, cocktail bar & lounge'
                    : kind === 'parking'
                      ? 'Garage · 2 levels, EV bays, ramp & security'
                      : kind === 'stadium'
                        ? 'Stadium · 984 seats, rising stands & editable pitch'
                        : 'Cinema · 48 seats, foyer & concessions'}
                </p>
              </div>
            </div>
            {error && <p className="field-error">{error}</p>}
            <button className="primary full" disabled={working}>
              Create venue
            </button>
          </form>
        </Modal>
      )}
      {modal === 'show' && (
        <Modal
          title={
            editingShow
              ? venue?.kind === 'stadium'
                ? 'Edit event'
                : 'Edit showtime'
              : venue?.kind === 'stadium'
                ? 'Add event'
                : 'Add a showtime'
          }
          onClose={() => setModal(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const show = await api<Show>(
                  `/venues/${venueId}/shows${editingShow ? `/${editingShow.id}` : ''}`,
                  json(
                    {
                      title: showTitle,
                      start:
                        editingShow && showStart === localTime(new Date(editingShow.start))
                          ? editingShow.start
                          : new Date(showStart).toISOString(),
                      end:
                        editingShow && showEnd === localTime(new Date(editingShow.end))
                          ? editingShow.end
                          : new Date(showEnd).toISOString(),
                    },
                    editingShow ? 'PUT' : 'POST',
                  ),
                );
                setShows((items) =>
                  [...items.filter((item) => item.id !== show.id), show]
                    .filter((item) => Date.parse(item.end) > Date.now())
                    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start)),
                );
                if (Date.parse(show.end) > Date.now()) setShowId(show.id);
                setEventsRevision((n) => n + 1);
                setRefresh((n) => n + 1);
                setModal(null);
                await load();
                setMessage(editingShow ? 'Event updated.' : 'Showtime added.');
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
                value={showStart}
                onChange={(e) => setShowStart(e.target.value)}
                required
              />
            </label>
            <label>
              Ends
              <input
                type="datetime-local"
                value={showEnd}
                onChange={(e) => setShowEnd(e.target.value)}
                required
              />
            </label>
            {error && <p className="field-error">{error}</p>}
            <button className="primary full" disabled={working}>
              {editingShow
                ? 'Save changes'
                : venue?.kind === 'stadium'
                  ? 'Add event'
                  : 'Add showtime'}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
