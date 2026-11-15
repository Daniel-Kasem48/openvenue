import { EntityRepository } from '@mikro-orm/postgresql';
import type { Venue } from '../database/entities';

export class VenuesRepository extends EntityRepository<Venue> {
  async listWithNextEvent(includeArchived: boolean) {
    const rows = await this.em.execute(
      `SELECT v.*, v.archived_at AS "archivedAt", e.next_event_at AS "nextEventAt"
             FROM venues v LEFT JOIN (
               SELECT venue_id, min(starts_at) AS next_event_at FROM shows
               WHERE starts_at > now() GROUP BY venue_id
             ) e ON e.venue_id=v.id AND v.kind IN ('cinema','stadium')
             WHERE (? OR v.archived_at IS NULL) ORDER BY v.name`,
      [includeArchived],
    );
    return rows.map((row) => ({
      ...row,
      archived_at: row.archived_at == null ? null : new Date(row.archived_at),
      archivedAt: row.archivedAt == null ? null : new Date(row.archivedAt),
      nextEventAt: row.nextEventAt == null ? null : new Date(row.nextEventAt),
    }));
  }
  async readActivePricing(venueId: string) {
    return this.em.execute(
      `SELECT s.price_multiplier,
          coalesce(json_agg(json_build_object('tierId', p.tier_id, 'amount', p.amount))
            FILTER (WHERE p.tier_id IS NOT NULL), '[]') AS overrides
        FROM shows s LEFT JOIN show_prices p ON p.show_id=s.id
        WHERE s.venue_id=? AND s.ends_at>now() GROUP BY s.id`,
      [venueId],
    );
  }
}
