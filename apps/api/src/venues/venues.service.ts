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
import { LockMode } from '@mikro-orm/core';
import { Venue } from '../database/entities';
import { randomUUID } from 'node:crypto';
import type { Principal } from '../auth/credentials';
import { audit } from '../common/audit';
import { fail } from '../common/errors';
import { DatabaseService } from '../database/database.service';
import { syncResources } from '../database/queries';

@Injectable()
export class VenuesService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}
  async list(query: Record<string, unknown>) {
    const rows = await this.db.em.execute(
      `SELECT v.*, v.archived_at AS "archivedAt", e.next_event_at AS "nextEventAt"
             FROM venues v LEFT JOIN (
               SELECT venue_id, min(starts_at) AS next_event_at FROM shows
               WHERE starts_at > now() GROUP BY venue_id
             ) e ON e.venue_id=v.id AND v.kind IN ('cinema','stadium')
             WHERE (? OR v.archived_at IS NULL) ORDER BY v.name`,
      [query.includeArchived === '1'],
    );
    return rows.map((row) => ({
      ...row,
      archived_at: row.archived_at == null ? null : new Date(row.archived_at),
      archivedAt: row.archivedAt == null ? null : new Date(row.archivedAt),
      nextEventAt: row.nextEventAt == null ? null : new Date(row.nextEventAt),
    }));
  }
  async create(input: unknown) {
    const body = createVenueSchema.parse(input);
    const venue = await this.db.em.transactional(async (em) => {
      let layout = makeTemplate(body.kind);
      if (body.empty && body.sourceId) fail(400, 'Choose an empty layout or duplicate a venue');
      if (body.empty)
        layout = {
          ...layout,
          pricing: { mode: 'free', currency: 'USD', amount: 0 },
          floors: [{ ...layout.floors[0], name: 'Main floor', resources: [], objects: [] }],
        };
      if (body.sourceId) {
        const source = await em.findOne(Venue, body.sourceId);
        if (!source) return fail(404, 'Source venue not found');
        if (source.kind !== body.kind) fail(400, 'Duplicate must use the same venue type');
        layout = cloneLayout(layoutSchema.parse(source.layout));
      }
      const row = em.create(Venue, {
        id: randomUUID(),
        name: body.name,
        kind: body.kind,
        layout,
        archived_at: null,
      });
      await em.flush();
      await syncResources(em, row.id, layout);
      return row;
    });
    return venue;
  }
  async update(id: string, input: unknown) {
    const body = patchVenueSchema.parse(input);
    const venue = await this.db.em.transactional(async (em) => {
      const old = await em.findOne(Venue, id, { lockMode: LockMode.PESSIMISTIC_WRITE });
      if (!old) return fail(404, 'Venue not found');
      if (old.revision !== body.revision)
        fail(409, 'This venue changed elsewhere. Reload before editing.');
      em.assign(old, {
        name: body.name ?? old.name,
        archived_at:
          body.archived === undefined
            ? old.archived_at
            : body.archived
              ? (old.archived_at ?? new Date())
              : null,
        revision: old.revision + 1,
      });
      await em.flush();
      return { ...old, archivedAt: old.archived_at };
    });
    return venue;
  }
  async saveLayout(id: string, input: unknown, principal: Principal) {
    const body = saveVenueSchema.parse(input);
    const venue = await this.db.em.transactional(async (em) => {
      const old = await em.findOne(Venue, id, { lockMode: LockMode.PESSIMISTIC_WRITE });
      if (!old) return fail(404, 'Venue not found');
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
      const eventPrices = await em.execute(
        `SELECT s.price_multiplier,
          coalesce(json_agg(json_build_object('tierId', p.tier_id, 'amount', p.amount))
            FILTER (WHERE p.tier_id IS NOT NULL), '[]') AS overrides
        FROM shows s LEFT JOIN show_prices p ON p.show_id=s.id
        WHERE s.venue_id=? AND s.ends_at>now() GROUP BY s.id`,
        [old.id],
      );
      const resources = body.layout.floors.flatMap((floor) => floor.resources);
      for (const row of eventPrices) {
        const pricing = eventPricingSchema.parse({
          multiplier: Number(row.price_multiplier),
          overrides: row.overrides,
        });
        for (const resource of resources) reservationPrice(body.layout, resource, pricing);
      }
      await syncResources(em, old.id, body.layout);
      await audit(em, principal, 'layout.saved', 'venue', old.id);
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
        await audit(em, principal, 'pricing.changed', 'venue', old.id);
      em.assign(old, { name: body.name, layout: body.layout, revision: old.revision + 1 });
      await em.flush();
      return old;
    });
    return venue;
  }
}
