import type {
  AvailabilityQueryDto,
  CreateBookingDto,
  BookingFiltersDto,
  UpdateBookingDto,
} from '../dto/bookings.dto';
import { Inject, Injectable } from '@nestjs/common';
import { LockMode } from '@mikro-orm/core';
import { layoutSchema, reservationPrice, seatLocation } from '@openvenue/contracts';
import { randomUUID } from 'node:crypto';
import type { Principal } from '../../auth/utils/credentials';
import { audit } from '../../../common/audit';
import { fail } from '../../../common/errors';
import { DatabaseService } from '../../database/database.service';
import { Booking } from '../entities/booking.entity';
import { EventSeatBlock } from '../../events/entities/event-seat-block.entity';
import { Show } from '../../events/entities/show.entity';
import { Venue } from '../../venues/entities/venue.entity';
import { applyBookingUpdate, priceSelection, selectPlaces } from '../policies/booking-policy';
import { bookingsCsv, toPublicBooking } from '../mappers/booking-response';

@Injectable()
export class BookingsService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async availability(id: string, query: AvailabilityQueryDto) {
    const times = query;
    const { showId } = query;
    const em = this.db.em;
    const bookings = em.getRepository(Booking);
    const venue = await em.getRepository(Venue).findOne({ id });
    if (!venue) fail(404, 'Venue not found');
    const layout = layoutSchema.parse(venue.layout);
    const busy = await bookings.findBusyResourceIds(id, times.start, times.end);
    const pricing = showId ? await em.getRepository(Show).readPricing(id, showId) : undefined;
    const prices = Object.fromEntries(
      layout.floors
        .flatMap((floor) => floor.resources)
        .map((resource) => [resource.id, reservationPrice(layout, resource, pricing)]),
    );
    const blocked = await bookings.findBlockedResourceIds(id, times.start, times.end, showId);
    return {
      busy: [...new Set([...busy, ...blocked])],
      blocked,
      prices,
      currency: layout.pricing.currency,
    };
  }

  async create(request: CreateBookingDto) {
    return this.db.em.transactional(async (em) => {
      const bookings = em.getRepository(Booking);
      const shows = em.getRepository(Show);
      // The venue lock serializes checkout with layout, pricing and inventory changes.
      const venue = await em
        .getRepository(Venue)
        .findOne({ id: request.venueId }, { lockMode: LockMode.PESSIMISTIC_WRITE });
      if (!venue) fail(404, 'Venue not found');
      const show = request.showId
        ? await shows.findOne({ id: request.showId, venue_id: request.venueId })
        : null;
      const selection = selectPlaces(venue, show, request);
      if (
        request.showId &&
        (await em.getRepository(EventSeatBlock).count({
          show_id: request.showId,
          resource_id: { $in: selection.resources.map((resource) => resource.id) },
        }))
      )
        fail(409, 'Some selected seats are blocked for this event. Choose other seats.');
      const pricing = request.showId
        ? await shows.readPricing(request.venueId, request.showId)
        : undefined;
      const places = priceSelection(selection, request, pricing);
      const created = places.map(({ resource, price }) =>
        bookings.create({
          id: randomUUID(),
          venue_id: venue.id,
          resource_id: resource.id,
          guest_name: request.guestName,
          starts_at: new Date(selection.times.start),
          ends_at: new Date(selection.times.end),
          show_id: request.showId ?? null,
          party_size: selection.partySize,
          price,
          currency: selection.layout.pricing.currency,
          seat_location: seatLocation(resource),
          event_title: selection.eventTitle,
          guest_email: request.guestEmail ?? null,
          guest_phone: request.guestPhone ?? null,
        }),
      );
      await em.flush();
      const confirmations = created.map(toPublicBooking);
      return request.resourceIds
        ? { ...confirmations[0], bookings: confirmations }
        : confirmations[0];
    });
  }

  async list(query: BookingFiltersDto) {
    return this.db.em.getRepository(Booking).list(query, true);
  }

  async update(id: string, patch: UpdateBookingDto, principal: Principal) {
    return this.db.em.transactional(async (em) => {
      const bookings = em.getRepository(Booking);
      const found = await bookings.findOne({ id });
      if (!found) fail(404, 'Reservation not found');
      await em
        .getRepository(Venue)
        .findOne({ id: found.venue_id }, { lockMode: LockMode.PESSIMISTIC_WRITE });
      const booking = await bookings.findOneOrFail(
        { id },
        { lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true },
      );
      const checkedInAt =
        patch.checkedIn === true && !booking.checked_in_at
          ? await bookings.currentTime()
          : booking.checked_in_at;
      const { cancelled } = applyBookingUpdate(booking, patch, checkedInAt);
      await em.flush();
      if (cancelled) await audit(em, principal, 'booking.cancelled', 'booking', id);
      return bookings.getDetails(id);
    });
  }

  async csv(query: BookingFiltersDto) {
    const result = await this.db.em.getRepository(Booking).list(query, false);
    return bookingsCsv(result.items);
  }
}
