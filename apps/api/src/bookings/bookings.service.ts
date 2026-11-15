import { Inject, Injectable } from '@nestjs/common';
import {
  bookingFiltersSchema,
  bookingPatchSchema,
  bookingSchema,
  intervalSchema,
  layoutSchema,
  reservationPrice,
  seatLocation,
} from '@openvenue/contracts';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Principal } from '../auth/credentials';
import { audit } from '../common/audit';
import { fail } from '../common/errors';
import { DatabaseService } from '../database/database.service';
import { transaction } from '../database/queries';
import { EventsService } from '../events/events.service';
import { adminBookingSelect, bookingColumns, bookingsCsv, queryBookings } from './queries';

@Injectable()
export class BookingsService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(EventsService) private readonly events: EventsService,
  ) {}
  async availability(id: string, query: Record<string, unknown>) {
    const times = intervalSchema.parse(query);
    const venue = (await this.db.pool.query('SELECT layout FROM venues WHERE id=$1', [id])).rows[0];
    if (!venue) fail(404, 'Venue not found');
    const layout = layoutSchema.parse(venue.layout);
    const rows = await this.db.pool.query(
      "SELECT resource_id FROM bookings WHERE venue_id=$1 AND status='confirmed' AND starts_at<$3 AND ends_at>$2",
      [id, times.start, times.end],
    );
    const showId = z.uuid().optional().parse(query.showId);
    const pricing = showId ? await this.events.readPricing(this.db.pool, id, showId) : undefined;
    const prices = Object.fromEntries(
      layout.floors
        .flatMap((floor) => floor.resources)
        .map((resource) => [resource.id, reservationPrice(layout, resource, pricing)]),
    );
    const blocked = await this.db.pool.query(
      `SELECT b.resource_id FROM event_seat_blocks b JOIN shows s ON s.id=b.show_id WHERE s.venue_id=$1 AND ($4::uuid IS NULL OR s.id=$4) AND s.starts_at<$3 AND s.ends_at>$2`,
      [id, times.start, times.end, showId ?? null],
    );
    const blockedIds = blocked.rows.map((r) => r.resource_id);
    return {
      busy: [...new Set([...rows.rows.map((r) => r.resource_id), ...blockedIds])],
      blocked: blockedIds,
      prices,
      currency: layout.pricing.currency,
    };
  }
  async create(input: unknown) {
    const body = bookingSchema.parse(input);
    const booked = await transaction(this.db.pool, async (client) => {
      const venue = (
        await client.query('SELECT kind,layout,archived_at FROM venues WHERE id=$1 FOR UPDATE', [
          body.venueId,
        ])
      ).rows[0];
      if (!venue) fail(404, 'Venue not found');
      if (venue.archived_at) fail(409, 'This venue is archived and cannot receive reservations.');
      let times;
      let eventTitle: string | null = null;
      if (['cinema', 'stadium'].includes(venue.kind)) {
        if (!body.showId) fail(400, 'Choose a showtime');
        const show = (
          await client.query(
            'SELECT title,starts_at,ends_at FROM shows WHERE id=$1 AND venue_id=$2',
            [body.showId, body.venueId],
          )
        ).rows[0];
        if (!show) fail(400, 'Showtime not found');
        eventTitle = show.title;
        times = { start: show.starts_at.toISOString(), end: show.ends_at.toISOString() };
        if (
          (body.start !== undefined || body.end !== undefined) &&
          (Date.parse(body.start ?? '') !== +show.starts_at ||
            Date.parse(body.end ?? '') !== +show.ends_at)
        )
          fail(409, 'Event time changed. Review the updated schedule before confirming.');
      } else {
        if (body.showId) fail(400, 'Events are only available for cinemas and stadiums');
        times = intervalSchema.parse(body);
      }
      if (Date.parse(times.start) <= Date.now()) fail(400, 'Reservations must start in the future');
      const ids = body.resourceIds ?? [body.resourceId];
      if (ids[0] !== body.resourceId) fail(400, 'The first selected seat must match the resource');
      if (!['cinema', 'stadium'].includes(venue.kind) && ids.length !== 1)
        fail(400, 'Choose one table or parking space');
      if (['cinema', 'stadium'].includes(venue.kind) && ids.length !== body.partySize)
        fail(400, 'Choose one seat for each guest');
      if (venue.kind === 'parking' && body.partySize !== 1)
        fail(400, 'Reserve one parking space at a time');
      const layout = layoutSchema.parse(venue.layout);
      const resources = layout.floors.flatMap((f) => f.resources);
      for (const id of ids) {
        const resource = resources.find((r) => r.id === id);
        if (!resource) return fail(404, 'Resource not found');
        if (venue.kind === 'restaurant' && resource.capacity < body.partySize)
          fail(400, 'Your party exceeds this table’s capacity');
      }
      if (
        body.showId &&
        (
          await client.query(
            'SELECT resource_id FROM event_seat_blocks WHERE show_id=$1 AND resource_id=ANY($2::uuid[])',
            [body.showId, ids],
          )
        ).rowCount
      )
        fail(409, 'Some selected seats are blocked for this event. Choose other seats.');
      const eventPricing = body.showId
        ? await this.events.readPricing(client, body.venueId, body.showId)
        : undefined;
      const prices = Object.fromEntries(
        ids.map((id) => [
          id,
          reservationPrice(
            layout,
            resources.find((resource) => resource.id === id)!,
            eventPricing,
          ),
        ]),
      );
      const total = ids.reduce((sum, id) => sum + prices[id], 0);
      if (
        (total > 0 || body.expectedTotal !== undefined) &&
        (body.expectedTotal !== total || body.expectedCurrency !== layout.pricing.currency)
      )
        fail(409, 'Prices changed. Review the updated total before confirming.');
      const bookings = [];
      for (const id of ids) {
        bookings.push(
          (
            await client.query(
              `INSERT INTO bookings AS b(id,venue_id,resource_id,guest_name,starts_at,ends_at,show_id,party_size,price,currency,seat_location,event_title,guest_email,guest_phone) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING ${bookingColumns}`,
              [
                randomUUID(),
                body.venueId,
                id,
                body.guestName,
                times.start,
                times.end,
                body.showId ?? null,
                venue.kind === 'restaurant' ? body.partySize : 1,
                prices[id],
                layout.pricing.currency,
                seatLocation(resources.find((r) => r.id === id)!),
                eventTitle,
                body.guestEmail ?? null,
                body.guestPhone ?? null,
              ],
            )
          ).rows[0],
        );
      }
      return body.resourceIds ? { ...bookings[0], bookings } : bookings[0];
    });
    return booked;
  }
  async list(query: Record<string, unknown>) {
    return await queryBookings(this.db.pool, bookingFiltersSchema.parse(query), true);
  }
  async update(id: string, body: z.infer<typeof bookingPatchSchema>, principal: Principal) {
    return transaction(this.db.pool, async (client) => {
      const found = (await client.query('SELECT venue_id FROM bookings WHERE id=$1', [id])).rows[0];
      if (!found) fail(404, 'Reservation not found');
      await client.query('SELECT id FROM venues WHERE id=$1 FOR UPDATE', [found.venue_id]);
      const booking = (
        await client.query('SELECT status FROM bookings WHERE id=$1 FOR UPDATE', [id])
      ).rows[0];
      if (body.checkedIn === true && booking.status !== 'confirmed')
        fail(409, 'Only confirmed reservations can be checked in');
      if (body.status && booking.status !== 'confirmed' && body.status !== booking.status)
        fail(409, 'This reservation already has a terminal status');
      await client.query(
        `UPDATE bookings SET notes=coalesce($2,notes),status=coalesce($3,status),
        checked_in_at=CASE WHEN coalesce($3,status)<>'confirmed' THEN NULL
          WHEN $4::boolean IS NULL THEN checked_in_at WHEN $4 THEN coalesce(checked_in_at,now()) ELSE NULL END
        WHERE id=$1`,
        [id, body.notes ?? null, body.status ?? null, body.checkedIn ?? null],
      );
      if (booking.status === 'confirmed' && body.status === 'cancelled')
        await audit(client, principal, 'booking.cancelled', 'booking', id);
      return (await client.query(adminBookingSelect + ' WHERE b.id=$1', [id])).rows[0];
    });
  }

  async csv(query: Record<string, unknown>) {
    return bookingsCsv(
      (await queryBookings(this.db.pool, bookingFiltersSchema.parse(query), false)).items,
    );
  }
}
