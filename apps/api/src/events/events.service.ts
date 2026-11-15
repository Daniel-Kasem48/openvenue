import { Inject, Injectable } from '@nestjs/common';
import {
  eventPricingSchema,
  eventSchema,
  layoutSchema,
  reservationPrice,
} from '@openvenue/contracts';
import { randomUUID } from 'node:crypto';
import { LockMode, raw } from '@mikro-orm/core';
import type { EntityManager } from '@mikro-orm/postgresql';
import { z } from 'zod';
import type { Principal } from '../auth/credentials';
import { audit } from '../common/audit';
import { fail } from '../common/errors';
import { DatabaseService } from '../database/database.service';
import { Booking, EventSeatBlock, Show, ShowPrice, Venue } from '../database/entities';
const blockSeatsSchema = z.object({
  resourceIds: z
    .array(z.uuid().transform((id) => id.toLowerCase()))
    .min(1)
    .max(1000)
    .refine((ids) => new Set(ids).size === ids.length, 'Choose each seat only once'),
  reason: z.string().trim().min(1).max(240),
});

@Injectable()
export class EventsService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}
  async listShows(id: string) {
    const shows = await this.db.em.getRepository(Show).find(
      { venue_id: id, ends_at: { $gt: raw('now()') } },
      {
        orderBy: { starts_at: 'asc' },
      },
    );
    return shows.map((show) => ({
      id: show.id,
      title: show.title,
      start: show.starts_at,
      end: show.ends_at,
    }));
  }
  async listEvents(id: string) {
    const venueId = z.uuid().parse(id);
    return this.db.em.getRepository(Show).listManaged(venueId);
  }

  async create(id: string, input: unknown) {
    const venueId = z.uuid().parse(id),
      body = eventSchema.parse(input);
    const row = await this.db.em.transactional(async (em) => {
      const venue = await em
        .getRepository(Venue)
        .findOne(venueId, { lockMode: LockMode.PESSIMISTIC_WRITE });
      if (!venue) return fail(404, 'Venue not found');
      if (!['cinema', 'stadium'].includes(venue.kind))
        fail(400, 'Events are only available for cinemas and stadiums');
      if (Date.parse(body.start) <= Date.now()) fail(400, 'Show must start in the future');
      const show = em.getRepository(Show).create({
        id: randomUUID(),
        venue_id: venueId,
        title: body.title,
        starts_at: new Date(body.start),
        ends_at: new Date(body.end),
      });
      await em.flush();
      return { id: show.id, title: show.title, start: show.starts_at, end: show.ends_at };
    });
    return row;
  }
  async getPricing(id: string, eventId: string) {
    return await this.db.em
      .getRepository(Show)
      .readPricing(z.uuid().parse(id), z.uuid().parse(eventId));
  }
  async setPricing(id: string, eventId: string, input: unknown, principal: Principal) {
    const venueId = z.uuid().parse(id),
      showId = z.uuid().parse(eventId);
    const pricing = eventPricingSchema.parse(input);
    await this.db.em.transactional(async (em) => {
      const prices = em.getRepository(ShowPrice);
      await this.lockShow(em, venueId, showId);
      const venue = await em.getRepository(Venue).findOneOrFail(venueId);
      const layout = layoutSchema.parse(venue.layout);
      if (
        pricing.overrides.some(
          (override) => !layout.pricing.tiers?.some((tier) => tier.id === override.tierId),
        )
      )
        fail(400, 'Price tier not found in this venue');
      for (const resource of layout.floors.flatMap((floor) => floor.resources))
        reservationPrice(layout, resource, pricing);
      await em.getRepository(Show).nativeUpdate(showId, { price_multiplier: pricing.multiplier });
      await prices.nativeDelete({ show_id: showId });
      for (const override of pricing.overrides)
        em.persist(
          prices.create({
            show_id: showId,
            tier_id: override.tierId,
            amount: override.amount,
          }),
        );
      await em.flush();
      await audit(em, principal, 'pricing.changed', 'show', showId);
    });
    return pricing;
  }
  async update(id: string, eventId: string, input: unknown) {
    const venueId = z.uuid().parse(id),
      showId = z.uuid().parse(eventId),
      body = eventSchema.parse(input);
    const row = await this.db.em
      .transactional(async (em) => {
        const show = await this.lockShow(em, venueId, showId);
        const moved =
          Date.parse(body.start) !== +show.starts_at || Date.parse(body.end) !== +show.ends_at;
        if (moved && Date.parse(body.start) <= Date.now())
          fail(400, 'Rescheduled events must start in the future');
        if (moved)
          await em.getRepository(Booking).nativeUpdate(
            { show_id: showId, status: 'confirmed' },
            {
              starts_at: new Date(body.start),
              ends_at: new Date(body.end),
            },
          );
        em.assign(show, {
          title: body.title,
          starts_at: new Date(body.start),
          ends_at: new Date(body.end),
        });
        await em.flush();
        return { id: show.id, title: show.title, start: show.starts_at, end: show.ends_at };
      })
      .catch((error) => {
        if (error.code === '23P01')
          fail(
            409,
            'Cannot reschedule: a booked seat overlaps another reservation. No changes were saved.',
          );
        throw error;
      });
    return row;
  }
  async listBlocks(id: string, eventId: string) {
    const venueId = z.uuid().parse(id),
      showId = z.uuid().parse(eventId);
    return this.db.em.getRepository(Show).listBlocks(venueId, showId);
  }

  async blockSeats(id: string, eventId: string, input: unknown) {
    const venueId = z.uuid().parse(id),
      showId = z.uuid().parse(eventId);
    const body = blockSeatsSchema.parse(input);
    await this.db.em.transactional(async (em) => {
      const venue = await em
        .getRepository(Venue)
        .findOne(venueId, { lockMode: LockMode.PESSIMISTIC_WRITE });
      if (!venue) return fail(404, 'Venue not found');
      const show = await em.getRepository(Show).findOne({ id: showId, venue_id: venueId });
      if (!show) return fail(404, 'Event not found');
      if (new Date(show.ends_at).getTime() <= Date.now()) fail(400, 'This event has ended');
      const seats = layoutSchema
        .parse(venue.layout)
        .floors.flatMap((f) => f.resources)
        .filter((r) => r.kind === 'seat');
      if (body.resourceIds.some((id) => !seats.some((r) => r.id === id)))
        fail(400, 'Choose seats from this venue');
      const booked = await em.getRepository(Booking).count({
        resource_id: { $in: body.resourceIds },
        status: 'confirmed',
        starts_at: { $lt: show.ends_at },
        ends_at: { $gt: show.starts_at },
      });
      if (booked) fail(409, 'Some selected seats are already booked. No seats were blocked.');
      await em.getRepository(EventSeatBlock).upsertMany(
        body.resourceIds.map((resourceId) => ({
          show_id: showId,
          resource_id: resourceId,
          reason: body.reason,
        })),
      );
    });
    return { blocked: body.resourceIds };
  }
  async releaseSeats(id: string, eventId: string, input: unknown) {
    const venueId = z.uuid().parse(id),
      showId = z.uuid().parse(eventId);
    const { resourceIds } = blockSeatsSchema.omit({ reason: true }).parse(input);
    await this.db.em.transactional(async (em) => {
      await this.lockShow(em, venueId, showId);
      await em
        .getRepository(EventSeatBlock)
        .nativeDelete({ show_id: showId, resource_id: { $in: resourceIds } });
    });
    return { released: resourceIds };
  }
  private async lockShow(em: EntityManager, venueId: string, showId: string) {
    await em.getRepository(Venue).findOne(venueId, { lockMode: LockMode.PESSIMISTIC_WRITE });
    const show = await em.getRepository(Show).findOne({ id: showId, venue_id: venueId });
    if (!show) return fail(404, 'Event not found');
    return show;
  }
  async remove(id: string, eventId: string, cancel: boolean, principal: Principal) {
    const venueId = z.uuid().parse(id),
      showId = z.uuid().parse(eventId);
    const affected = await this.db.em.transactional(async (em) => {
      const bookings = em.getRepository(Booking);
      const show = await this.lockShow(em, venueId, showId);
      const count = await bookings.count({ show_id: showId, status: 'confirmed' });
      if (count && !cancel)
        fail(
          409,
          `This event has ${count} confirmed reservations. Use Cancel event to cancel them explicitly.`,
        );
      if (cancel)
        await bookings.nativeUpdate(
          { show_id: showId, status: 'confirmed' },
          {
            status: 'cancelled',
            checked_in_at: null,
          },
        );
      await em.getRepository(Show).detachBookings(showId, show.title);
      await em.getRepository(EventSeatBlock).nativeDelete({ show_id: showId });
      await em.getRepository(ShowPrice).nativeDelete({ show_id: showId });
      await em.getRepository(Show).nativeDelete(showId);
      if (cancel) await audit(em, principal, 'event.cancelled', 'show', showId);
      return count;
    });
    return { deleted: true, cancelledBookings: affected };
  }
}
