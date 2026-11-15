import { Inject, Injectable } from '@nestjs/common';
import {
  eventPricingSchema,
  eventSchema,
  layoutSchema,
  reservationPrice,
  type EventPricing,
} from '@openvenue/contracts';
import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import type { Principal } from '../auth/credentials';
import { audit } from '../common/audit';
import { fail } from '../common/errors';
import { DatabaseService } from '../database/database.service';
import { transaction } from '../database/queries';
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
    return (
      await this.db.pool.query(
        'SELECT id,title,starts_at AS start,ends_at AS end FROM shows WHERE venue_id=$1 AND ends_at>now() ORDER BY starts_at',
        [id],
      )
    ).rows;
  }
  async listEvents(id: string) {
    const venueId = z.uuid().parse(id);
    return (
      await this.db.pool.query(
        `
      SELECT s.id,s.title,s.starts_at AS start,s.ends_at AS end,
        (SELECT count(*)::int FROM bookings b WHERE b.show_id=s.id AND b.status='confirmed') AS sold,
        (SELECT count(*)::int FROM event_seat_blocks b WHERE b.show_id=s.id) AS blocked,
        greatest(0,(SELECT count(*)::int FROM resources r WHERE r.venue_id=s.venue_id)
          -(SELECT count(*)::int FROM event_seat_blocks b WHERE b.show_id=s.id)) AS capacity
      FROM shows s WHERE s.venue_id=$1 ORDER BY (s.ends_at<=now()),s.starts_at,s.id`,
        [venueId],
      )
    ).rows;
  }
  async create(id: string, input: unknown) {
    const venueId = z.uuid().parse(id),
      body = eventSchema.parse(input);
    const row = await transaction(this.db.pool, async (client) => {
      const venue = (
        await client.query('SELECT kind FROM venues WHERE id=$1 FOR UPDATE', [venueId])
      ).rows[0];
      if (!venue) fail(404, 'Venue not found');
      if (!['cinema', 'stadium'].includes(venue.kind))
        fail(400, 'Events are only available for cinemas and stadiums');
      if (Date.parse(body.start) <= Date.now()) fail(400, 'Show must start in the future');
      return (
        await client.query(
          'INSERT INTO shows(id,venue_id,title,starts_at,ends_at) VALUES($1,$2,$3,$4,$5) RETURNING id,title,starts_at AS start,ends_at AS end',
          [randomUUID(), venueId, body.title, body.start, body.end],
        )
      ).rows[0];
    });
    return row;
  }
  async getPricing(id: string, eventId: string) {
    return await this.readPricing(this.db.pool, z.uuid().parse(id), z.uuid().parse(eventId));
  }
  async setPricing(id: string, eventId: string, input: unknown, principal: Principal) {
    const venueId = z.uuid().parse(id),
      showId = z.uuid().parse(eventId);
    const pricing = eventPricingSchema.parse(input);
    await transaction(this.db.pool, async (client) => {
      await this.lockShow(client, venueId, showId);
      const venue = (await client.query('SELECT layout FROM venues WHERE id=$1', [venueId]))
        .rows[0];
      const layout = layoutSchema.parse(venue.layout);
      if (
        pricing.overrides.some(
          (override) => !layout.pricing.tiers?.some((tier) => tier.id === override.tierId),
        )
      )
        fail(400, 'Price tier not found in this venue');
      for (const resource of layout.floors.flatMap((floor) => floor.resources))
        reservationPrice(layout, resource, pricing);
      await client.query('UPDATE shows SET price_multiplier=$2 WHERE id=$1', [
        showId,
        pricing.multiplier,
      ]);
      await client.query('DELETE FROM show_prices WHERE show_id=$1', [showId]);
      for (const override of pricing.overrides)
        await client.query('INSERT INTO show_prices(show_id,tier_id,amount) VALUES($1,$2,$3)', [
          showId,
          override.tierId,
          override.amount,
        ]);
      await audit(client, principal, 'pricing.changed', 'show', showId);
    });
    return pricing;
  }
  async update(id: string, eventId: string, input: unknown) {
    const venueId = z.uuid().parse(id),
      showId = z.uuid().parse(eventId),
      body = eventSchema.parse(input);
    const row = await transaction(this.db.pool, async (client) => {
      const show = await this.lockShow(client, venueId, showId);
      const moved =
        Date.parse(body.start) !== +show.starts_at || Date.parse(body.end) !== +show.ends_at;
      if (moved && Date.parse(body.start) <= Date.now())
        fail(400, 'Rescheduled events must start in the future');
      if (moved)
        await client.query(
          "UPDATE bookings SET starts_at=$2,ends_at=$3 WHERE show_id=$1 AND status='confirmed'",
          [showId, body.start, body.end],
        );
      return (
        await client.query(
          'UPDATE shows SET title=$2,starts_at=$3,ends_at=$4 WHERE id=$1 RETURNING id,title,starts_at AS start,ends_at AS end',
          [showId, body.title, body.start, body.end],
        )
      ).rows[0];
    }).catch((error) => {
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
    return (
      await this.db.pool.query(
        `SELECT b.resource_id AS "resourceId",b.reason FROM event_seat_blocks b JOIN shows s ON s.id=b.show_id WHERE s.venue_id=$1 AND s.id=$2`,
        [venueId, showId],
      )
    ).rows;
  }
  async blockSeats(id: string, eventId: string, input: unknown) {
    const venueId = z.uuid().parse(id),
      showId = z.uuid().parse(eventId);
    const body = blockSeatsSchema.parse(input);
    await transaction(this.db.pool, async (client) => {
      const venue = (
        await client.query('SELECT layout FROM venues WHERE id=$1 FOR UPDATE', [venueId])
      ).rows[0];
      if (!venue) fail(404, 'Venue not found');
      const show = (
        await client.query('SELECT * FROM shows WHERE id=$1 AND venue_id=$2', [showId, venueId])
      ).rows[0];
      if (!show) fail(404, 'Event not found');
      if (new Date(show.ends_at).getTime() <= Date.now()) fail(400, 'This event has ended');
      const seats = layoutSchema
        .parse(venue.layout)
        .floors.flatMap((f) => f.resources)
        .filter((r) => r.kind === 'seat');
      if (body.resourceIds.some((id) => !seats.some((r) => r.id === id)))
        fail(400, 'Choose seats from this venue');
      const booked = await client.query(
        "SELECT id FROM bookings WHERE resource_id=ANY($1::uuid[]) AND status='confirmed' AND starts_at<$3 AND ends_at>$2",
        [body.resourceIds, show.starts_at, show.ends_at],
      );
      if (booked.rowCount)
        fail(409, 'Some selected seats are already booked. No seats were blocked.');
      await client.query(
        `INSERT INTO event_seat_blocks(show_id,resource_id,reason) SELECT $1,unnest($2::uuid[]),$3 ON CONFLICT(show_id,resource_id) DO UPDATE SET reason=EXCLUDED.reason`,
        [showId, body.resourceIds, body.reason],
      );
    });
    return { blocked: body.resourceIds };
  }
  async releaseSeats(id: string, eventId: string, input: unknown) {
    const venueId = z.uuid().parse(id),
      showId = z.uuid().parse(eventId);
    const { resourceIds } = blockSeatsSchema.omit({ reason: true }).parse(input);
    await transaction(this.db.pool, async (client) => {
      await client.query('SELECT id FROM venues WHERE id=$1 FOR UPDATE', [venueId]);
      const show = await client.query('SELECT id FROM shows WHERE id=$1 AND venue_id=$2', [
        showId,
        venueId,
      ]);
      if (!show.rowCount) fail(404, 'Event not found');
      await client.query(
        'DELETE FROM event_seat_blocks WHERE show_id=$1 AND resource_id=ANY($2::uuid[])',
        [showId, resourceIds],
      );
    });
    return { released: resourceIds };
  }
  private async lockShow(client: PoolClient, venueId: string, showId: string) {
    await client.query('SELECT id FROM venues WHERE id=$1 FOR UPDATE', [venueId]);
    const show = (
      await client.query('SELECT * FROM shows WHERE id=$1 AND venue_id=$2', [showId, venueId])
    ).rows[0];
    if (!show) fail(404, 'Event not found');
    return show;
  }
  async readPricing(
    client: Pool | PoolClient,
    venueId: string,
    showId: string,
  ): Promise<EventPricing> {
    const row = (
      await client.query(
        `SELECT s.price_multiplier,
      coalesce(json_agg(json_build_object('tierId', p.tier_id, 'amount', p.amount) ORDER BY p.tier_id) FILTER (WHERE p.tier_id IS NOT NULL), '[]') AS overrides
      FROM shows s LEFT JOIN show_prices p ON p.show_id=s.id
      WHERE s.id=$1 AND s.venue_id=$2 GROUP BY s.id`,
        [showId, venueId],
      )
    ).rows[0];
    if (!row) fail(404, 'Event not found');
    return eventPricingSchema.parse({
      multiplier: Number(row.price_multiplier),
      overrides: row.overrides,
    });
  }

  async remove(id: string, eventId: string, cancel: boolean, principal: Principal) {
    const venueId = z.uuid().parse(id),
      showId = z.uuid().parse(eventId);
    const affected = await transaction(this.db.pool, async (client) => {
      const show = await this.lockShow(client, venueId, showId);
      const count = (
        await client.query(
          "SELECT count(*)::int AS total FROM bookings WHERE show_id=$1 AND status='confirmed'",
          [showId],
        )
      ).rows[0].total;
      if (count && !cancel)
        fail(
          409,
          `This event has ${count} confirmed reservations. Use Cancel event to cancel them explicitly.`,
        );
      if (cancel)
        await client.query(
          "UPDATE bookings SET status='cancelled',checked_in_at=NULL WHERE show_id=$1 AND status='confirmed'",
          [showId],
        );
      // Keep reservation history and its title after removing the event foreign key.
      await client.query(
        'UPDATE bookings SET event_title=coalesce(event_title,$2),show_id=NULL WHERE show_id=$1',
        [showId, show.title],
      );
      await client.query('DELETE FROM event_seat_blocks WHERE show_id=$1', [showId]);
      await client.query('DELETE FROM show_prices WHERE show_id=$1', [showId]);
      await client.query('DELETE FROM shows WHERE id=$1', [showId]);
      if (cancel) await audit(client, principal, 'event.cancelled', 'show', showId);
      return count;
    });
    return { deleted: true, cancelledBookings: affected };
  }
}
