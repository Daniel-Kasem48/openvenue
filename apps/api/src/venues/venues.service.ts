import { Inject, Injectable } from '@nestjs/common';
import {
  cloneLayout,
  createVenueSchema,
  eventPricingSchema,
  layoutSchema,
  makeTemplate,
  patchVenueSchema,
  reservationPrice,
  saveVenueSchema,
} from '@openvenue/contracts';
import { randomUUID } from 'node:crypto';
import type { Principal } from '../auth/credentials';
import { audit } from '../common/audit';
import { fail } from '../common/errors';
import { DatabaseService } from '../database/database.service';
import { syncResources, transaction } from '../database/queries';

@Injectable()
export class VenuesService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}
  async list(query: Record<string, unknown>) {
    return (
      await this.db.pool.query(
        `SELECT v.*, v.archived_at AS "archivedAt", e.next_event_at AS "nextEventAt"
             FROM venues v LEFT JOIN (
               SELECT venue_id, min(starts_at) AS next_event_at FROM shows
               WHERE starts_at > now() GROUP BY venue_id
             ) e ON e.venue_id=v.id AND v.kind IN ('cinema','stadium')
             WHERE ($1 OR v.archived_at IS NULL) ORDER BY v.name`,
        [query.includeArchived === '1'],
      )
    ).rows;
  }
  async create(input: unknown) {
    const body = createVenueSchema.parse(input);
    const venue = await transaction(this.db.pool, async (client) => {
      let layout = makeTemplate(body.kind);
      if (body.empty && body.sourceId) fail(400, 'Choose an empty layout or duplicate a venue');
      if (body.empty)
        layout = {
          ...layout,
          pricing: { mode: 'free', currency: 'USD', amount: 0 },
          floors: [{ ...layout.floors[0], name: 'Main floor', resources: [], objects: [] }],
        };
      if (body.sourceId) {
        const source = (await client.query('SELECT * FROM venues WHERE id=$1', [body.sourceId]))
          .rows[0];
        if (!source) fail(404, 'Source venue not found');
        if (source.kind !== body.kind) fail(400, 'Duplicate must use the same venue type');
        layout = cloneLayout(layoutSchema.parse(source.layout));
      }
      const row = (
        await client.query(
          'INSERT INTO venues(id,name,kind,layout) VALUES($1,$2,$3,$4) RETURNING *',
          [randomUUID(), body.name, body.kind, JSON.stringify(layout)],
        )
      ).rows[0];
      await syncResources(client, row.id, layout);
      return row;
    });
    return venue;
  }
  async update(id: string, input: unknown) {
    const body = patchVenueSchema.parse(input);
    const venue = await transaction(this.db.pool, async (client) => {
      const old = (await client.query('SELECT * FROM venues WHERE id=$1 FOR UPDATE', [id])).rows[0];
      if (!old) fail(404, 'Venue not found');
      if (old.revision !== body.revision)
        fail(409, 'This venue changed elsewhere. Reload before editing.');
      return (
        await client.query(
          `UPDATE venues SET name=$2, archived_at=$3, revision=revision+1 WHERE id=$1 RETURNING *, archived_at AS "archivedAt"`,
          [
            old.id,
            body.name ?? old.name,
            body.archived === undefined
              ? old.archived_at
              : body.archived
                ? (old.archived_at ?? new Date())
                : null,
          ],
        )
      ).rows[0];
    });
    return venue;
  }
  async saveLayout(id: string, input: unknown, principal: Principal) {
    const body = saveVenueSchema.parse(input);
    const venue = await transaction(this.db.pool, async (client) => {
      const old = (await client.query('SELECT * FROM venues WHERE id=$1 FOR UPDATE', [id])).rows[0];
      if (!old) fail(404, 'Venue not found');
      if (old.revision !== body.revision)
        fail(409, 'This layout changed elsewhere. Reload before editing.');
      const resourceKind = {
        restaurant: 'table',
        parking: 'space',
        cinema: 'seat',
        stadium: 'seat',
      }[old.kind as 'restaurant' | 'parking' | 'cinema' | 'stadium'];
      if (body.layout.floors.some((f) => f.resources.some((r) => r.kind !== resourceKind)))
        fail(400, 'Resource type does not match this venue');
      const eventPrices = await client.query(
        `SELECT s.price_multiplier,
          coalesce(json_agg(json_build_object('tierId', p.tier_id, 'amount', p.amount))
            FILTER (WHERE p.tier_id IS NOT NULL), '[]') AS overrides
        FROM shows s LEFT JOIN show_prices p ON p.show_id=s.id
        WHERE s.venue_id=$1 AND s.ends_at>now() GROUP BY s.id`,
        [old.id],
      );
      const resources = body.layout.floors.flatMap((floor) => floor.resources);
      for (const row of eventPrices.rows) {
        const pricing = eventPricingSchema.parse({
          multiplier: Number(row.price_multiplier),
          overrides: row.overrides,
        });
        for (const resource of resources) reservationPrice(body.layout, resource, pricing);
      }
      await syncResources(client, old.id, body.layout);
      await audit(client, principal, 'layout.saved', 'venue', old.id);
      const priceFields = (layout: ReturnType<typeof layoutSchema.parse>) =>
        JSON.stringify({
          pricing: layout.pricing,
          resources: layout.floors.flatMap((f) =>
            f.resources.map((r) => ({
              id: r.id,
              price: r.price,
              tierId: r.tierId,
            })),
          ),
        });
      if (priceFields(layoutSchema.parse(old.layout)) !== priceFields(body.layout))
        await audit(client, principal, 'pricing.changed', 'venue', old.id);
      return (
        await client.query(
          'UPDATE venues SET name=$2,layout=$3,revision=revision+1 WHERE id=$1 RETURNING *',
          [old.id, body.name, JSON.stringify(body.layout)],
        )
      ).rows[0];
    });
    return venue;
  }
}
