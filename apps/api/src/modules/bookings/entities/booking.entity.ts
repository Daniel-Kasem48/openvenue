import { EntitySchema, type EntityRepositoryType, type OptionalProps } from '@mikro-orm/core';
import { BookingsRepository } from '../repositories/bookings.repository';

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
