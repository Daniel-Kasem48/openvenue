import { bookingCursorSchema, bookingFiltersSchema } from '@openvenue/contracts';
import type { Pool } from 'pg';
import type { z } from 'zod';

// Public confirmation fields deliberately exclude contacts and staff notes.
export const bookingColumns = `b.id, b.venue_id AS "venueId", b.resource_id AS "resourceId", b.guest_name AS "guestName", b.starts_at AS start, b.ends_at AS end, b.status, b.party_size AS "partySize", b.price, b.currency, b.seat_location AS "seatLocation", b.event_title AS "eventTitle"`;
export const adminBookingSelect = `SELECT ${bookingColumns}, b.show_id AS "showId", b.guest_email AS "guestEmail", b.guest_phone AS "guestPhone", b.notes, b.checked_in_at AS "checkedInAt", b.created_at AS "createdAt", v.name AS "venueName",r.label AS "resourceLabel" FROM bookings b JOIN venues v ON v.id=b.venue_id JOIN resources r ON r.id=b.resource_id`;

export async function queryBookings(
  pool: Pool,
  filters: z.infer<typeof bookingFiltersSchema>,
  paginate: boolean,
) {
  const values: unknown[] = [],
    clauses: string[] = [];
  const parameter = (value: unknown) => {
    values.push(value);
    return `$${values.length}`;
  };
  if (filters.venueId) clauses.push(`b.venue_id=${parameter(filters.venueId)}`);
  if (filters.showId) clauses.push(`b.show_id=${parameter(filters.showId)}`);
  if (filters.from) clauses.push(`b.ends_at>${parameter(filters.from)}`);
  if (filters.to) clauses.push(`b.starts_at<${parameter(filters.to)}`);
  if (filters.status !== 'all') clauses.push(`b.status=${parameter(filters.status)}`);
  if (filters.q) {
    const q = parameter(filters.q);
    clauses.push(
      `(strpos(lower(b.guest_name),lower(${q}))>0 OR strpos(lower(coalesce(b.guest_email,'')),lower(${q}))>0 OR strpos(b.id::text,lower(${q}))>0)`,
    );
  }
  if (paginate && filters.cursor) {
    let cursor;
    try {
      cursor = bookingCursorSchema.parse(
        JSON.parse(Buffer.from(filters.cursor, 'base64url').toString('utf8')),
      );
    } catch {
      throw Object.assign(new Error('Invalid reservation cursor'), { status: 400 });
    }
    clauses.push(
      `(b.starts_at,b.id)>(${parameter(cursor.start)}::timestamptz,${parameter(cursor.id)}::uuid)`,
    );
  }
  // Keep PostgreSQL microseconds in the cursor even though JSON dates show milliseconds.
  const select = adminBookingSelect.replace(
    ' FROM bookings',
    `, to_char(b.starts_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "cursorStart" FROM bookings`,
  );
  const result = await pool.query(
    `${select} ${clauses.length ? 'WHERE ' + clauses.join(' AND ') : ''} ORDER BY b.starts_at,b.id ${paginate ? `LIMIT ${parameter(filters.limit + 1)}` : ''}`,
    values,
  );
  const more = paginate && result.rows.length > filters.limit;
  const rows = more ? result.rows.slice(0, filters.limit) : result.rows;
  const last = rows.at(-1);
  return {
    items: rows.map(({ cursorStart: _cursor, ...booking }) => booking),
    nextCursor: more
      ? Buffer.from(JSON.stringify({ start: last.cursorStart, id: last.id })).toString('base64url')
      : null,
  };
}
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
