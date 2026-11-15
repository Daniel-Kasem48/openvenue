import type { Booking } from '../entities/booking.entity';

export function csvCell(value: unknown): string {
  let text = value instanceof Date ? value.toISOString() : String(value ?? '');
  if (/^[\s\uFEFF]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export function bookingsCsv(rows: Record<string, unknown>[]) {
  const columns = {
    Reference: 'id',
    'Guest name': 'guestName',
    Email: 'guestEmail',
    Phone: 'guestPhone',
    Venue: 'venueName',
    Event: 'eventTitle',
    Resource: 'seatLocation',
    'Starts (UTC)': 'start',
    'Ends (UTC)': 'end',
    'Party size': 'partySize',
    'Price (minor units)': 'price',
    Currency: 'currency',
    Status: 'status',
    'Checked in (UTC)': 'checkedInAt',
    Notes: 'notes',
  };
  return (
    '\uFEFF' +
    [
      Object.keys(columns).map(csvCell).join(','),
      ...rows.map((row) =>
        Object.values(columns)
          .map((key) =>
            csvCell(key === 'seatLocation' ? (row.seatLocation ?? row.resourceLabel) : row[key]),
          )
          .join(','),
      ),
    ].join('\r\n') +
    '\r\n'
  );
}

// Raw PostgreSQL timestamps are strings in MikroORM; preserve the API and CSV date format.
export function toAdminBooking(row: Record<string, any>) {
  return {
    ...row,
    start: new Date(row.start),
    end: new Date(row.end),
    checkedInAt: row.checkedInAt == null ? null : new Date(row.checkedInAt),
    createdAt: new Date(row.createdAt),
  };
}

// Explicit public DTO: never expose contact details or operator notes from a managed entity.
export function toPublicBooking(booking: Booking) {
  return {
    id: booking.id,
    venueId: booking.venue_id,
    resourceId: booking.resource_id,
    guestName: booking.guest_name,
    start: booking.starts_at,
    end: booking.ends_at,
    status: booking.status,
    partySize: booking.party_size,
    price: booking.price,
    currency: booking.currency,
    seatLocation: booking.seat_location,
    eventTitle: booking.event_title,
  };
}
