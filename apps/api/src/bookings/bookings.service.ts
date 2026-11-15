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
import { LockMode } from '@mikro-orm/core';
import { Booking, EventSeatBlock, Show, Venue } from '../database/entities';
import { EventsService } from '../events/events.service';
import { adminBookingSelect, bookingRecord, bookingsCsv, queryBookings } from './queries';

@Injectable()
export class BookingsService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(EventsService) private readonly events: EventsService,
  ) {}
  async availability(id: string, query: Record<string, unknown>) {
    const times = intervalSchema.parse(query);
    const em = this.db.em;
    const venue = await em.findOne(Venue, { id });
    if (!venue) fail(404, 'Venue not found');
    const layout = layoutSchema.parse(venue.layout);
    const rows = await em.find(Booking, {
      venue_id: id,
      status: 'confirmed',
      starts_at: { $lt: new Date(times.end) },
      ends_at: { $gt: new Date(times.start) },
    });
    const showId = z.uuid().optional().parse(query.showId);
    const pricing = showId ? await this.events.readPricing(em, id, showId) : undefined;
    const prices = Object.fromEntries(
      layout.floors
        .flatMap((floor) => floor.resources)
        .map((resource) => [resource.id, reservationPrice(layout, resource, pricing)]),
    );
    const blocked = await em.execute(
      `SELECT b.resource_id FROM event_seat_blocks b JOIN shows s ON s.id=b.show_id WHERE s.venue_id=:venueId AND (:showId::uuid IS NULL OR s.id=:showId) AND s.starts_at<:end AND s.ends_at>:start`,
      { venueId: id, showId: showId ?? null, start: times.start, end: times.end },
    );
    const blockedIds = blocked.map((r) => r.resource_id);
    return {
      busy: [...new Set([...rows.map((r) => r.resource_id), ...blockedIds])],
      blocked: blockedIds,
      prices,
      currency: layout.pricing.currency,
    };
  }
  async create(input: unknown) {
    const body = bookingSchema.parse(input);
    const booked = await this.db.em.transactional(async (em) => {
      const venue = await em.findOne(
        Venue,
        { id: body.venueId },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (!venue) fail(404, 'Venue not found');
      if (venue.archived_at) fail(409, 'This venue is archived and cannot receive reservations.');
      let times;
      let eventTitle: string | null = null;
      if (['cinema', 'stadium'].includes(venue.kind)) {
        if (!body.showId) fail(400, 'Choose a showtime');
        const show = await em.findOne(Show, { id: body.showId, venue_id: body.venueId });
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
        (await em.count(EventSeatBlock, { show_id: body.showId, resource_id: { $in: ids } }))
      )
        fail(409, 'Some selected seats are blocked for this event. Choose other seats.');
      const eventPricing = body.showId
        ? await this.events.readPricing(em, body.venueId, body.showId)
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
        const booking = em.create(Booking, {
          id: randomUUID(),
          venue_id: body.venueId,
          resource_id: id,
          guest_name: body.guestName,
          starts_at: new Date(times.start),
          ends_at: new Date(times.end),
          show_id: body.showId ?? null,
          party_size: venue.kind === 'restaurant' ? body.partySize : 1,
          price: prices[id],
          currency: layout.pricing.currency,
          seat_location: seatLocation(resources.find((r) => r.id === id)!),
          event_title: eventTitle,
          guest_email: body.guestEmail ?? null,
          guest_phone: body.guestPhone ?? null,
        });
        await em.flush();
        // Public confirmations must never serialize the full entity's private guest details.
        bookings.push({
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
        });
      }
      return body.resourceIds ? { ...bookings[0], bookings } : bookings[0];
    });
    return booked;
  }
  async list(query: Record<string, unknown>) {
    return await queryBookings(this.db.em, bookingFiltersSchema.parse(query), true);
  }
  async update(id: string, body: z.infer<typeof bookingPatchSchema>, principal: Principal) {
    return this.db.em.transactional(async (em) => {
      const found = await em.findOne(Booking, { id });
      if (!found) fail(404, 'Reservation not found');
      await em.findOne(Venue, { id: found.venue_id }, { lockMode: LockMode.PESSIMISTIC_WRITE });
      const booking = await em.findOneOrFail(
        Booking,
        { id },
        { lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true },
      );
      if (body.checkedIn === true && booking.status !== 'confirmed')
        fail(409, 'Only confirmed reservations can be checked in');
      if (body.status && booking.status !== 'confirmed' && body.status !== booking.status)
        fail(409, 'This reservation already has a terminal status');
      const oldStatus = booking.status;
      if (body.notes !== undefined) booking.notes = body.notes;
      if (body.status !== undefined) booking.status = body.status;
      if (booking.status !== 'confirmed') booking.checked_in_at = null;
      else if (body.checkedIn === false) booking.checked_in_at = null;
      else if (body.checkedIn === true && !booking.checked_in_at) {
        const [{ now }] = await em.execute('SELECT now()');
        booking.checked_in_at = new Date(now);
      }
      await em.flush();
      if (oldStatus === 'confirmed' && body.status === 'cancelled')
        await audit(em, principal, 'booking.cancelled', 'booking', id);
      return bookingRecord((await em.execute(adminBookingSelect + ' WHERE b.id=?', [id]))[0]);
    });
  }

  async csv(query: Record<string, unknown>) {
    return bookingsCsv(
      (await queryBookings(this.db.em, bookingFiltersSchema.parse(query), false)).items,
    );
  }
}
