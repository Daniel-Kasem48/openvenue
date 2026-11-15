import { EntityRepository } from '@mikro-orm/postgresql';
import { bookingCursorSchema } from '@openvenue/contracts';
import type { BookingFiltersDto } from '../dto/bookings.dto';
import type { Booking } from '../entities/booking.entity';
import { toAdminBooking } from '../mappers/booking-response';

// Public confirmation fields deliberately exclude contacts and staff notes.
const bookingColumns = `b.id, b.venue_id AS "venueId", b.resource_id AS "resourceId", b.guest_name AS "guestName", b.starts_at AS start, b.ends_at AS end, b.status, b.party_size AS "partySize", b.price, b.currency, b.seat_location AS "seatLocation", b.event_title AS "eventTitle"`;
const adminBookingSelect = `SELECT ${bookingColumns}, b.show_id AS "showId", b.guest_email AS "guestEmail", b.guest_phone AS "guestPhone", b.notes, b.checked_in_at AS "checkedInAt", b.created_at AS "createdAt", v.name AS "venueName",r.label AS "resourceLabel" FROM bookings b JOIN venues v ON v.id=b.venue_id JOIN resources r ON r.id=b.resource_id`;

export class BookingsRepository extends EntityRepository<Booking> {
  async list(filters: BookingFiltersDto, paginate: boolean) {
    const values: unknown[] = [],
      clauses: string[] = [];
    const parameter = (value: unknown) => {
      values.push(value);
      return `:p${values.length}`;
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
    const result = await this.em.execute(
      `${select} ${clauses.length ? 'WHERE ' + clauses.join(' AND ') : ''} ORDER BY b.starts_at,b.id ${paginate ? `LIMIT ${parameter(filters.limit + 1)}` : ''}`,
      Object.fromEntries(values.map((value, i) => [`p${i + 1}`, value])),
    );
    const more = paginate && result.length > filters.limit;
    const rows = more ? result.slice(0, filters.limit) : result;
    const last = rows.at(-1);
    return {
      items: rows.map(({ cursorStart: _cursor, ...booking }) => toAdminBooking(booking)),
      nextCursor:
        more && last
          ? Buffer.from(JSON.stringify({ start: last.cursorStart, id: last.id })).toString(
              'base64url',
            )
          : null,
    };
  }

  async findBusyResourceIds(venueId: string, start: string, end: string) {
    const bookings = await this.find(
      {
        venue_id: venueId,
        status: 'confirmed',
        starts_at: { $lt: new Date(end) },
        ends_at: { $gt: new Date(start) },
      },
      { fields: ['resource_id'] },
    );
    return bookings.map((booking) => booking.resource_id);
  }

  async findBlockedResourceIds(
    venueId: string,
    start: string,
    end: string,
    showId?: string,
  ): Promise<string[]> {
    const rows = await this.em.execute(
      `SELECT b.resource_id FROM event_seat_blocks b JOIN shows s ON s.id=b.show_id
       WHERE s.venue_id=:venueId AND (:showId::uuid IS NULL OR s.id=:showId)
         AND s.starts_at<:end AND s.ends_at>:start`,
      { venueId, showId: showId ?? null, start, end },
    );
    return rows.map((row) => row.resource_id);
  }

  async getDetails(id: string) {
    const [row] = await this.em.execute(adminBookingSelect + ' WHERE b.id=?', [id]);
    return toAdminBooking(row);
  }

  async currentTime(): Promise<Date> {
    const [{ now }] = await this.em.execute('SELECT now()');
    return new Date(now);
  }
}
