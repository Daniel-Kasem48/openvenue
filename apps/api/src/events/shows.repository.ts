import { EntityRepository } from '@mikro-orm/postgresql';
import { eventPricingSchema, type EventPricing } from '@openvenue/contracts';
import type { Show } from '../database/entities';
import { fail } from '../common/errors';

export class ShowsRepository extends EntityRepository<Show> {
  async listManaged(venueId: string) {
    const rows = await this.em.execute(
      `
      SELECT s.id,s.title,s.starts_at AS start,s.ends_at AS end,
        (SELECT count(*)::int FROM bookings b WHERE b.show_id=s.id AND b.status='confirmed') AS sold,
        (SELECT count(*)::int FROM event_seat_blocks b WHERE b.show_id=s.id) AS blocked,
        greatest(0,(SELECT count(*)::int FROM resources r WHERE r.venue_id=s.venue_id)
          -(SELECT count(*)::int FROM event_seat_blocks b WHERE b.show_id=s.id)) AS capacity
      FROM shows s WHERE s.venue_id=? ORDER BY (s.ends_at<=now()),s.starts_at,s.id`,
      [venueId],
    );
    return rows.map((row) => ({ ...row, start: new Date(row.start), end: new Date(row.end) }));
  }
  async listBlocks(venueId: string, showId: string) {
    return await this.em.execute(
      `SELECT b.resource_id AS "resourceId",b.reason FROM event_seat_blocks b JOIN shows s ON s.id=b.show_id WHERE s.venue_id=? AND s.id=?`,
      [venueId, showId],
    );
  }
  async detachBookings(showId: string, title: string) {
    // Keep reservation history and its title after removing the event foreign key.
    return this.em.execute(
      'UPDATE bookings SET event_title=coalesce(event_title,?),show_id=NULL WHERE show_id=?',
      [title, showId],
    );
  }
  async readPricing(venueId: string, showId: string): Promise<EventPricing> {
    // Read multiplier and overrides in one snapshot while pricing may change concurrently.
    const [row] = await this.em.execute(
      `SELECT s.price_multiplier,
        coalesce(json_agg(json_build_object('tierId',p.tier_id,'amount',p.amount) ORDER BY p.tier_id)
          FILTER (WHERE p.tier_id IS NOT NULL),'[]') AS overrides
       FROM shows s LEFT JOIN show_prices p ON p.show_id=s.id
       WHERE s.id=? AND s.venue_id=? GROUP BY s.id`,
      [showId, venueId],
    );
    if (!row) return fail(404, 'Event not found');
    return eventPricingSchema.parse({
      multiplier: Number(row.price_multiplier),
      overrides: row.overrides,
    });
  }
}
