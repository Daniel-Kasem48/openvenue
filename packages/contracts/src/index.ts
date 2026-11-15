import { z } from 'zod';
const uuid = z.uuid().transform((value) => value.toLowerCase());
export const kindSchema = z.enum(['restaurant', 'parking', 'cinema', 'stadium']);
export type VenueKind = z.infer<typeof kindSchema>;
export const currencySchema = z.enum(['USD', 'EUR', 'GBP', 'AED', 'SAR', 'SYP']);
export const pricingSchema = z.object({
  mode: z.enum(['free', 'uniform', 'per-resource', 'tiers']).default('free'),
  tiers: z
    .array(
      z.object({
        id: z.uuid(),
        name: z.string().trim().min(1).max(100),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        amount: z.number().int().min(0).max(100000000),
      }),
    )
    .max(12)
    .refine(
      (tiers) => new Set(tiers.map((tier) => tier.id)).size === tiers.length,
      'Tier identifiers must be unique',
    )
    .optional(),
  currency: currencySchema.default('USD'),
  amount: z.number().int().min(0).max(100000000).default(0),
});
const name = z.string().trim().min(1).max(100);
export const resourceSchema = z.object({
  id: uuid,
  label: name,
  section: z.string().trim().max(40).default(''),
  row: z
    .string()
    .trim()
    .max(12)
    .regex(/^[A-Za-z0-9-]*$/)
    .toUpperCase()
    .optional(),
  seatNumber: z.number().int().min(1).max(10000).optional(),
  kind: z.enum(['table', 'space', 'seat']),
  x: z.number().min(0).max(200),
  y: z.number().min(0).max(200),
  width: z.number().min(0.3).max(20),
  depth: z.number().min(0.3).max(20),
  rotation: z.number().min(0).max(360),
  shape: z.enum(['rectangle', 'round']).default('rectangle'),
  price: z.number().int().min(0).max(100000000).optional(),
  tierId: z.uuid().optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default('#985864'),
  elevation: z.number().min(0).max(8).default(0),
  capacity: z.number().int().min(1).max(50),
  accessible: z.boolean(),
  ev: z.boolean(),
});
export type Resource = z.infer<typeof resourceSchema>;
export const objectKinds = [
  'plant',
  'counter',
  'sofa',
  'partition',
  'column',
  'door',
  'screen',
  'stairs',
  'ramp',
  'car',
  'charger',
  'barrier',
  'pitch',
  'label',
] as const;
export const sceneObjectSchema = resourceSchema
  .pick({ id: true, label: true, x: true, y: true, width: true, depth: true, rotation: true })
  .extend({
    kind: z.enum(objectKinds),
    width: z.number().min(0.3).max(200),
    depth: z.number().min(0.3).max(200),
    height: z.number().min(0.1).max(8),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  });
export type SceneObject = z.infer<typeof sceneObjectSchema>;
export const floorSchema = z.object({
  id: uuid,
  name,
  width: z.number().min(5).max(200),
  depth: z.number().min(5).max(200),
  resources: z.array(resourceSchema).max(1000),
  objects: z.array(sceneObjectSchema).max(300).default([]),
});
export const layoutSchema = z
  .object({
    version: z.literal(1),
    pricing: pricingSchema.default({ mode: 'free', currency: 'USD', amount: 0 }),
    floors: z.array(floorSchema).min(1).max(10),
  })
  .superRefine((layout, ctx) => {
    const ids = new Set<string>();
    for (const floor of layout.floors) {
      for (const id of [floor.id, ...[...floor.resources, ...floor.objects].map((r) => r.id)]) {
        if (ids.has(id)) ctx.addIssue({ code: 'custom', message: 'Identifiers must be unique' });
        ids.add(id);
      }
      const addresses = new Set<string>();
      for (const r of floor.resources) {
        if (r.tierId && !layout.pricing.tiers?.some((tier) => tier.id === r.tierId))
          ctx.addIssue({ code: 'custom', message: 'Resource price tier must exist' });
        if (r.kind !== 'seat') continue;
        const { row, seatNumber } = seatIdentity(r);
        if (!row || seatNumber === undefined) continue;
        const address = JSON.stringify([seatSection(r), row, seatNumber]);
        if (addresses.has(address))
          ctx.addIssue({
            code: 'custom',
            message: 'Seat numbers must be unique within each block and row',
          });
        addresses.add(address);
      }
      for (const r of [...floor.resources, ...floor.objects]) {
        const angle = (r.rotation * Math.PI) / 180;
        const extentX =
          (Math.abs(r.width * Math.cos(angle)) + Math.abs(r.depth * Math.sin(angle))) / 2;
        const extentY =
          (Math.abs(r.width * Math.sin(angle)) + Math.abs(r.depth * Math.cos(angle))) / 2;
        if (
          r.x - extentX < -0.001 ||
          r.y - extentY < -0.001 ||
          r.x + extentX > floor.width + 0.001 ||
          r.y + extentY > floor.depth + 0.001
        )
          ctx.addIssue({ code: 'custom', message: `${r.label} must fit inside its floor` });
      }
    }
  });
export type Layout = z.infer<typeof layoutSchema>;
export type Floor = Layout['floors'][number];
export const venueSchema = z.object({
  id: uuid,
  name,
  kind: kindSchema,
  layout: layoutSchema,
  revision: z.number().int().nonnegative(),
  archivedAt: z.iso.datetime({ offset: true }).nullable().optional(),
  nextEventAt: z.iso.datetime({ offset: true }).nullable().optional(),
});
export type Venue = z.infer<typeof venueSchema>;
export type Show = { id: string; title: string; start: string; end: string };
export type Booking = {
  id: string;
  venueId: string;
  resourceId: string;
  guestName: string;
  start: string;
  end: string;
  status: 'confirmed' | 'cancelled' | 'no_show';
  partySize: number;
  price: number;
  currency: z.infer<typeof currencySchema>;
  venueName?: string;
  resourceLabel?: string;
  seatLocation?: string;
  eventTitle?: string | null;
};
export const createVenueSchema = z.object({
  name,
  kind: kindSchema,
  sourceId: uuid.optional(),
  empty: z.boolean().default(false),
});
export const patchVenueSchema = z
  .object({
    name: name.optional(),
    archived: z.boolean().optional(),
    revision: z.number().int().min(1),
  })
  .strict()
  .refine((v) => v.name !== undefined || v.archived !== undefined, 'Choose a setting to update');
export const saveVenueSchema = z.object({
  name,
  layout: layoutSchema,
  revision: z.number().int().min(1),
});
export const intervalSchema = z
  .object({ start: z.iso.datetime({ offset: true }), end: z.iso.datetime({ offset: true }) })
  .refine(
    (v) =>
      Date.parse(v.end) > Date.parse(v.start) &&
      Date.parse(v.end) - Date.parse(v.start) <= 7 * 86400000,
    { message: 'Choose a positive interval of at most seven days' },
  );
export const eventSchema = intervalSchema.safeExtend({ title: z.string().trim().min(1).max(100) });
export type ManagedEvent = Show & { sold: number; capacity: number; blocked: number };

export const bookingSchema = z.object({
  venueId: uuid,
  resourceId: uuid,
  resourceIds: z
    .array(uuid)
    .min(1)
    .max(20)
    .refine((ids) => new Set(ids).size === ids.length, 'Choose each seat only once')
    .optional(),
  partySize: z.number().int().min(1).max(50).default(1),
  expectedTotal: z.number().int().min(0).max(2000000000).optional(),
  expectedCurrency: currencySchema.optional(),
  guestName: name,
  guestEmail: z.email().max(254).optional(),
  guestPhone: z
    .string()
    .trim()
    .regex(/^[+\d() .-]{3,40}$/, 'Enter a valid phone number')
    .optional(),
  start: z.iso.datetime({ offset: true }).optional(),
  end: z.iso.datetime({ offset: true }).optional(),
  showId: uuid.optional(),
});
export { makeTemplate, cloneLayout, makeObject } from './templates';

export function reservationPrice(layout: Layout, resource: Resource): number {
  if (layout.pricing.mode === 'tiers')
    return (
      layout.pricing.tiers?.find((tier) => tier.id === resource.tierId)?.amount ??
      resource.price ??
      layout.pricing.amount
    );
  return layout.pricing?.mode === 'uniform'
    ? layout.pricing.amount
    : layout.pricing?.mode === 'per-resource'
      ? (resource.price ?? 0)
      : 0;
}
export function formatPrice(amount: number, currency: string): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount / 100);
}

export function seatIdentity(resource: Resource) {
  const legacy = resource.kind === 'seat' ? resource.label.match(/(?:^|\s)([A-Z]+)(\d+)$/) : null;
  return {
    row: resource.row ?? legacy?.[1] ?? '',
    seatNumber: resource.seatNumber ?? (legacy ? Number(legacy[2]) : undefined),
  };
}
export function seatSection(resource: Resource): string {
  return (
    resource.section ||
    (resource.kind === 'seat' ? (resource.label.match(/^(.*?)\s+[A-Z]+\d+$/)?.[1] ?? '') : '')
  );
}
export function seatLocation(resource: Resource): string {
  if (resource.kind !== 'seat') return resource.label;
  const { row, seatNumber } = seatIdentity(resource);
  return [
    resource.section ? `Block ${resource.section}` : seatSection(resource),
    row && `Row ${row}`,
    seatNumber !== undefined && `Seat ${seatNumber}`,
    !row && seatNumber === undefined && resource.label,
  ]
    .filter(Boolean)
    .join(' · ');
}
export function seatRows(floor: Floor) {
  const groups = new Map<
    string,
    { section: string; row: string; seats: Resource[]; x: number; y: number; elevation: number }
  >();
  for (const seat of floor.resources) {
    const { row } = seatIdentity(seat);
    if (seat.kind !== 'seat' || !row) continue;
    const key = JSON.stringify([seatSection(seat), row]);
    if (!groups.has(key))
      groups.set(key, {
        section: seatSection(seat),
        row,
        seats: [],
        x: 0,
        y: 0,
        elevation: seat.elevation,
      });
    groups.get(key)!.seats.push(seat);
  }
  for (const group of groups.values()) {
    group.seats.sort(
      (a, b) => (seatIdentity(a).seatNumber ?? 0) - (seatIdentity(b).seatNumber ?? 0),
    );
    const [first, second] = group.seats;
    const dx = second ? second.x - first.x : 1,
      dy = second ? second.y - first.y : 0;
    const length = Math.hypot(dx, dy) || 1;
    group.x = first.x - (dx / length) * 1.1;
    group.y = first.y - (dy / length) * 1.1;
  }
  return [...groups.values()];
}

export const overviewRangeSchema = z
  .object({
    from: z.iso.datetime({ offset: true }),
    to: z.iso.datetime({ offset: true }),
  })
  .refine(({ from, to }) => {
    const duration = Date.parse(to) - Date.parse(from);
    return duration > 0 && duration <= 366 * 86400000;
  }, 'Choose a range of at most 366 days');
const occupancySchema = z.object({
  booked: z.number().nonnegative(),
  capacity: z.number().nonnegative(),
});
const overviewEventSchema = z.object({
  id: z.string(),
  venueId: z.string(),
  venueName: z.string(),
  title: z.string(),
  start: z.string(),
  sold: z.number().nonnegative(),
  capacity: z.number().nonnegative(),
  blocked: z.number().nonnegative(),
});
export const overviewSchema = z.object({
  reservations: z.number().nonnegative(),
  placesBooked: z.number().nonnegative(),
  revenue: z.array(z.object({ currency: currencySchema, amount: z.number().nonnegative() })),
  seats: occupancySchema,
  resources: occupancySchema,
  events: z.array(overviewEventSchema),
  recent: z.array(
    z.object({
      id: z.string(),
      guestName: z.string(),
      venueName: z.string(),
      resourceLabel: z.string(),
      start: z.string(),
    }),
  ),
  venues: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      kind: z.string(),
      booked: z.number().nonnegative(),
      capacity: z.number().nonnegative(),
      event: overviewEventSchema.nullable(),
    }),
  ),
});
export type OverviewData = z.infer<typeof overviewSchema>;

export type AdminBooking = Booking & {
  showId: string | null;
  guestEmail: string | null;
  guestPhone: string | null;
  notes: string;
  checkedInAt: string | null;
  createdAt: string;
};
export type BookingPage = { items: AdminBooking[]; nextCursor: string | null };
export const bookingFiltersSchema = z
  .object({
    venueId: z.uuid().optional(),
    showId: z.uuid().optional(),
    from: z.iso.datetime({ offset: true }).optional(),
    to: z.iso.datetime({ offset: true }).optional(),
    status: z.enum(['confirmed', 'cancelled', 'no_show', 'all']).default('confirmed'),
    q: z
      .string()
      .trim()
      .max(100)
      .refine((text) => !text.includes('\0'), 'Invalid search text')
      .default(''),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: z
      .string()
      .max(256)
      .regex(/^[A-Za-z0-9_-]+$/)
      .optional(),
  })
  .refine(
    ({ from, to }) => !from || !to || Date.parse(to) > Date.parse(from),
    'Choose a positive date range',
  );
export const bookingCursorSchema = z
  .object({ start: z.iso.datetime({ offset: true }), id: z.uuid() })
  .strict();
export const bookingPatchSchema = z
  .object({
    notes: z
      .string()
      .max(4000)
      .refine((text) => !text.includes('\0'), 'Notes cannot contain null characters')
      .optional(),
    checkedIn: z.boolean().optional(),
    status: z.enum(['cancelled', 'no_show']).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Choose a change')
  .refine(
    (value) => !(value.status && value.checkedIn === true),
    'Terminal reservations cannot be checked in',
  );
