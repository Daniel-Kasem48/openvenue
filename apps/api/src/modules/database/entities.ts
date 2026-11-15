import { BookingsRepository } from '../bookings/bookings.repository';
import { ShowsRepository } from '../events/shows.repository';
import { VenuesRepository } from '../venues/venues.repository';
import { EntitySchema, type EntityRepositoryType, type OptionalProps } from '@mikro-orm/core';
import type { Layout, VenueKind } from '@openvenue/contracts';

// Map the existing schema; SQL migrations retain its checks and exclusion constraints.
export interface Venue {
  [EntityRepositoryType]?: VenuesRepository;
  [OptionalProps]?: 'revision' | 'archived_at';
  id: string;
  name: string;
  kind: VenueKind;
  layout: Layout;
  revision: number;
  archived_at: Date | null;
}
export const Venue = new EntitySchema<Venue>({
  name: 'Venue',
  repository: () => VenuesRepository,
  tableName: 'venues',
  properties: {
    id: { type: 'uuid', primary: true },
    name: { type: 'text' },
    kind: { type: 'string' },
    layout: { type: 'json' },
    revision: { type: 'integer', default: 1 },
    archived_at: { type: 'Date', columnType: 'timestamptz', nullable: true },
  },
});

export interface Resource {
  id: string;
  venue_id: string;
  label: string;
}
export const Resource = new EntitySchema<Resource>({
  name: 'Resource',
  tableName: 'resources',
  properties: {
    id: { type: 'uuid', primary: true },
    venue_id: { kind: 'm:1', type: 'Venue', mapToPk: true, fieldName: 'venue_id' },
    label: { type: 'text' },
  },
});

export interface Show {
  [EntityRepositoryType]?: ShowsRepository;
  [OptionalProps]?: 'price_multiplier';
  id: string;
  venue_id: string;
  title: string;
  starts_at: Date;
  ends_at: Date;
  price_multiplier: number;
}
export const Show = new EntitySchema<Show>({
  name: 'Show',
  repository: () => ShowsRepository,
  tableName: 'shows',
  properties: {
    id: { type: 'uuid', primary: true },
    venue_id: { kind: 'm:1', type: 'Venue', mapToPk: true, fieldName: 'venue_id' },
    title: { type: 'text' },
    starts_at: { type: 'Date', columnType: 'timestamptz' },
    ends_at: { type: 'Date', columnType: 'timestamptz' },
    price_multiplier: {
      type: 'decimal',
      precision: 4,
      scale: 2,
      runtimeType: 'number',
      default: 1,
    },
  },
});

export interface Booking {
  [EntityRepositoryType]?: BookingsRepository;
  [OptionalProps]?:
    | 'show_id'
    | 'status'
    | 'created_at'
    | 'party_size'
    | 'price'
    | 'currency'
    | 'seat_location'
    | 'event_title'
    | 'guest_email'
    | 'guest_phone'
    | 'notes'
    | 'checked_in_at';
  id: string;
  venue_id: string;
  resource_id: string;
  guest_name: string;
  starts_at: Date;
  ends_at: Date;
  show_id: string | null;
  status: 'confirmed' | 'cancelled' | 'no_show';
  created_at: Date;
  party_size: number;
  price: number;
  currency: string;
  seat_location: string | null;
  event_title: string | null;
  guest_email: string | null;
  guest_phone: string | null;
  notes: string;
  checked_in_at: Date | null;
}
export const Booking = new EntitySchema<Booking>({
  name: 'Booking',
  repository: () => BookingsRepository,
  tableName: 'bookings',
  properties: {
    id: { type: 'uuid', primary: true },
    venue_id: { kind: 'm:1', type: 'Venue', mapToPk: true, fieldName: 'venue_id' },
    resource_id: { kind: 'm:1', type: 'Resource', mapToPk: true, fieldName: 'resource_id' },
    guest_name: { type: 'text' },
    starts_at: { type: 'Date', columnType: 'timestamptz' },
    ends_at: { type: 'Date', columnType: 'timestamptz' },
    show_id: { kind: 'm:1', type: 'Show', mapToPk: true, fieldName: 'show_id', nullable: true },
    status: { type: 'string', default: 'confirmed' },
    created_at: { type: 'Date', columnType: 'timestamptz', defaultRaw: 'now()' },
    party_size: { type: 'integer', default: 1 },
    price: { type: 'integer', default: 0 },
    currency: { type: 'text', default: 'USD' },
    seat_location: { type: 'text', nullable: true },
    event_title: { type: 'text', nullable: true },
    guest_email: { type: 'text', nullable: true },
    guest_phone: { type: 'text', nullable: true },
    notes: { type: 'text', default: '' },
    checked_in_at: { type: 'Date', columnType: 'timestamptz', nullable: true },
  },
});

export interface User {
  [OptionalProps]?: 'created_at' | 'disabled_at';
  id: string;
  email: string;
  name: string;
  password_hash: string;
  role: 'owner' | 'manager' | 'staff';
  created_at: Date;
  disabled_at: Date | null;
}
export const User = new EntitySchema<User>({
  name: 'User',
  tableName: 'users',
  properties: {
    id: { type: 'uuid', primary: true },
    email: { type: 'text' },
    name: { type: 'text' },
    password_hash: { type: 'text' },
    role: { type: 'string' },
    created_at: { type: 'Date', columnType: 'timestamptz', defaultRaw: 'now()' },
    disabled_at: { type: 'Date', columnType: 'timestamptz', nullable: true },
  },
});

export interface Session {
  [OptionalProps]?: 'user_id';
  token_hash: string;
  expires_at: Date;
  user_id: string | null;
}
export const Session = new EntitySchema<Session>({
  name: 'Session',
  tableName: 'sessions',
  properties: {
    token_hash: { type: 'text', primary: true },
    expires_at: { type: 'Date', columnType: 'timestamptz' },
    user_id: { kind: 'm:1', type: 'User', mapToPk: true, fieldName: 'user_id', nullable: true },
  },
});

export interface ShowPrice {
  show_id: string;
  tier_id: string;
  amount: number;
}
export const ShowPrice = new EntitySchema<ShowPrice>({
  name: 'ShowPrice',
  tableName: 'show_prices',
  properties: {
    show_id: { kind: 'm:1', type: 'Show', mapToPk: true, fieldName: 'show_id', primary: true },
    tier_id: { type: 'text', primary: true },
    amount: { type: 'integer' },
  },
});

export interface EventSeatBlock {
  [OptionalProps]?: 'created_at';
  show_id: string;
  resource_id: string;
  reason: string;
  created_at: Date;
}
export const EventSeatBlock = new EntitySchema<EventSeatBlock>({
  name: 'EventSeatBlock',
  tableName: 'event_seat_blocks',
  properties: {
    show_id: { kind: 'm:1', type: 'Show', mapToPk: true, fieldName: 'show_id', primary: true },
    resource_id: {
      kind: 'm:1',
      type: 'Resource',
      mapToPk: true,
      fieldName: 'resource_id',
      primary: true,
    },
    reason: { type: 'text' },
    created_at: { type: 'Date', columnType: 'timestamptz', defaultRaw: 'now()' },
  },
});

export interface AuditLog {
  [OptionalProps]?: 'user_id' | 'at';
  id: string;
  user_id: string | null;
  action: string;
  entity: string;
  entity_id: string;
  at: Date;
}
export const AuditLog = new EntitySchema<AuditLog>({
  name: 'AuditLog',
  tableName: 'audit_log',
  properties: {
    id: { type: 'uuid', primary: true },
    user_id: { kind: 'm:1', type: 'User', mapToPk: true, fieldName: 'user_id', nullable: true },
    action: { type: 'text' },
    entity: { type: 'text' },
    entity_id: { type: 'uuid' },
    at: { type: 'Date', columnType: 'timestamptz', defaultRaw: 'now()' },
  },
});

export const entities = [
  Venue,
  Resource,
  Show,
  Booking,
  User,
  Session,
  ShowPrice,
  EventSeatBlock,
  AuditLog,
];
